import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe-wallet";
import { isShopOpen, loadShopSettings } from "@/lib/shop/settings";
import { normalizeLineCustomization, serializeProduct } from "@/lib/shop/serialize";
import {
  formatCustomization,
  formatShopStripeDescription,
  formatVariantOptions,
  lineUnitAmount,
  variantAvailable,
  variantUnitPrice,
  type ShopOrderLine,
} from "@/lib/shop/types";

export const dynamic = "force-dynamic";

type CartLineIn = {
  productId?: string;
  variantId?: string;
  qty?: number;
  customization?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const buyerName = typeof body.buyerName === "string" ? body.buyerName.trim() : "";
    const buyerEmail = typeof body.buyerEmail === "string" ? body.buyerEmail.trim() : "";
    const buyerPhone = typeof body.buyerPhone === "string" ? body.buyerPhone.trim() : "";
    const items = Array.isArray(body.items) ? (body.items as CartLineIn[]) : [];

    if (!buyerName || !buyerEmail || !buyerPhone) {
      return NextResponse.json(
        { error: "Name, email, and phone are required" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const settings = await loadShopSettings(adminDb);
    if (!isShopOpen(settings)) {
      return NextResponse.json({ error: "The shop is not accepting orders right now" }, { status: 403 });
    }

    const lines: ShopOrderLine[] = [];
    for (const item of items) {
      const productId = String(item.productId ?? "");
      const variantId = String(item.variantId ?? "");
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
      if (!productId || !variantId) {
        return NextResponse.json({ error: "Invalid cart line" }, { status: 400 });
      }
      const snap = await adminDb.collection("shopProducts").doc(productId).get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Product not found" }, { status: 400 });
      }
      const product = serializeProduct(snap.id, snap.data() as Record<string, unknown>);
      if (product.status !== "PUBLISHED") {
        return NextResponse.json({ error: `${product.name} is not available` }, { status: 400 });
      }
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) {
        return NextResponse.json({ error: "Variant not found" }, { status: 400 });
      }
      if (!variantAvailable(variant, qty)) {
        return NextResponse.json(
          {
            error: `Not enough remaining for ${product.name} (${formatVariantOptions(variant.size, variant.color)})`,
          },
          { status: 400 }
        );
      }

      let customization = normalizeLineCustomization(item.customization);
      let customizationFee = 0;
      const cfg = product.customization;
      if (customization) {
        if (!cfg.enabled) {
          return NextResponse.json(
            { error: `Customization is not available for ${product.name}` },
            { status: 400 }
          );
        }
        const name = customization.jerseyName.replace(/[^A-Z0-9 ]/g, "").trim();
        const num = customization.jerseyNumber.replace(/[^0-9]/g, "");
        if (cfg.requireName && !name) {
          return NextResponse.json(
            { error: `Jersey name is required for ${product.name}` },
            { status: 400 }
          );
        }
        if (cfg.requireNumber && !num) {
          return NextResponse.json(
            { error: `Jersey number is required for ${product.name}` },
            { status: 400 }
          );
        }
        if (name.length > cfg.nameMaxLength) {
          return NextResponse.json(
            { error: `Jersey name must be at most ${cfg.nameMaxLength} characters` },
            { status: 400 }
          );
        }
        if (num) {
          const n = Number(num);
          if (!Number.isFinite(n) || n < cfg.numberMin || n > cfg.numberMax) {
            return NextResponse.json(
              {
                error: `Jersey number must be between ${cfg.numberMin} and ${cfg.numberMax}`,
              },
              { status: 400 }
            );
          }
        }
        customization = {
          jerseyName: name.slice(0, cfg.nameMaxLength),
          jerseyNumber: num,
        };
        if (!customization.jerseyName && !customization.jerseyNumber) {
          customization = null;
        } else {
          customizationFee = cfg.fee;
        }
      }

      const unitPrice = variantUnitPrice(product, variant);
      lines.push({
        productId,
        variantId,
        name: product.name,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        qty,
        unitPrice,
        customizationFee,
        customization,
        image: product.images[0] ?? null,
      });
    }

    const subtotal = lines.reduce((s, l) => s + lineUnitAmount(l) * l.qty, 0);
    const total = subtotal;
    if (total <= 0) {
      return NextResponse.json({ error: "Invalid total" }, { status: 400 });
    }

    const orderRef = adminDb.collection("shopOrders").doc();
    await orderRef.set({
      buyerName,
      buyerEmail,
      buyerPhone,
      lines,
      subtotal,
      total,
      paymentStatus: "pending_checkout",
      fulfillmentStatus: "pending_review",
      stripeSessionId: null,
      stripePaymentIntentId: null,
      stripeLivemode: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const stripeMode =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") &&
      Boolean(process.env.STRIPE_SECRET_KEY_TEST?.trim())
        ? "test"
        : "live";
    const stripe = getStripe(stripeMode);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: lines.map((l) => {
        const custom = formatCustomization(l.customization);
        const base = `${l.name} — ${formatVariantOptions(l.size, l.color)}`;
        return {
          quantity: l.qty,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(lineUnitAmount(l) * 100),
            product_data: {
              name: custom ? `${base} · ${custom}` : base,
              ...(l.image ? { images: [l.image] } : {}),
            },
          },
        };
      }),
      payment_intent_data: {
        capture_method: "manual",
        description: formatShopStripeDescription(lines, {
          seasonTitle: settings.seasonTitle,
        }),
        metadata: {
          purpose: "shop_order",
          shopOrderId: orderRef.id,
        },
      },
      metadata: {
        purpose: "shop_order",
        shopOrderId: orderRef.id,
      },
      success_url: `${origin}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop/cart`,
    });

    await orderRef.update({
      stripeSessionId: session.id,
      stripeLivemode: session.livemode === true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ url: session.url, orderId: orderRef.id });
  } catch (err) {
    console.error("POST /api/shop/checkout", err);
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
