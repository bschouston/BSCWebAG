import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStripe } from "@/lib/stripe-wallet";
import { isShopOpen, loadShopSettings } from "@/lib/shop/settings";
import { serializeProduct } from "@/lib/shop/serialize";
import {
  formatCustomization,
  formatVariantOptions,
  lineUnitAmount,
  variantAvailable,
  type ShopOrderLine,
} from "@/lib/shop/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function tokensMatch(stored: string, provided: string): boolean {
  try {
    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing repay token" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const ref = adminDb.collection("shopOrders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;
    const storedToken = typeof data.repayToken === "string" ? data.repayToken : "";
    if (!storedToken || !tokensMatch(storedToken, token)) {
      return NextResponse.json({ error: "Invalid or expired repay link" }, { status: 403 });
    }
    if (data.paymentStatus !== "capture_failed" && data.paymentStatus !== "pending_repay") {
      return NextResponse.json(
        { error: "This order is not awaiting payment" },
        { status: 400 }
      );
    }

    const settings = await loadShopSettings(adminDb);
    if (!isShopOpen(settings)) {
      return NextResponse.json(
        { error: "The shop is not accepting payments right now. Please contact the club." },
        { status: 403 }
      );
    }

    const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
    if (lines.length === 0) {
      return NextResponse.json({ error: "Order has no lines" }, { status: 400 });
    }

    for (const line of lines) {
      const productSnap = await adminDb.collection("shopProducts").doc(line.productId).get();
      if (!productSnap.exists) {
        return NextResponse.json(
          { error: `${line.name} is no longer available` },
          { status: 400 }
        );
      }
      const product = serializeProduct(
        productSnap.id,
        productSnap.data() as Record<string, unknown>
      );
      if (product.status !== "PUBLISHED") {
        return NextResponse.json(
          { error: `${product.name} is no longer available` },
          { status: 400 }
        );
      }
      const variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant || !variantAvailable(variant, line.qty)) {
        return NextResponse.json(
          {
            error: `Not enough remaining for ${line.name} (${formatVariantOptions(line.size, line.color)})`,
          },
          { status: 400 }
        );
      }
    }

    const buyerEmail = String(data.buyerEmail ?? "");
    const total = Number(data.total) || 0;
    if (!buyerEmail || total <= 0) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

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
        description: settings.seasonTitle
          ? `Shop re-pay: ${settings.seasonTitle}`
          : "BSC shop order re-pay",
        metadata: {
          purpose: "shop_order_repay",
          shopOrderId: id,
        },
      },
      metadata: {
        purpose: "shop_order_repay",
        shopOrderId: id,
      },
      success_url: `${origin}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}&repay=1`,
      cancel_url: `${origin}/shop/checkout/repay?orderId=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`,
    });

    await ref.update({
      paymentStatus: "pending_repay",
      stripeSessionId: session.id,
      stripeLivemode: session.livemode === true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ url: session.url, orderId: id });
  } catch (err) {
    console.error("POST /api/shop/orders/[id]/repay", err);
    const message = err instanceof Error ? err.message : "Re-pay failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
