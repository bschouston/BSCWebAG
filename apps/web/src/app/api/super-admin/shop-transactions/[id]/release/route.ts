import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { getStripe, stripeModeFromLivemode } from "@/lib/stripe-wallet";
import { releaseVariants } from "@/lib/shop/inventory";
import { serializeOrder } from "@/lib/shop/serialize";
import type { ShopOrderLine } from "@/lib/shop/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  const { id } = await ctx.params;

  try {
    const ref = getAdminDb().collection("shopOrders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (data.paymentStatus !== "authorized") {
      return NextResponse.json({ error: "Order is not authorized" }, { status: 400 });
    }

    const piId = typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    if (piId) {
      const stripe = getStripe(stripeModeFromLivemode(data.stripeLivemode === true));
      try {
        await stripe.paymentIntents.cancel(piId);
      } catch (err) {
        // Already canceled is OK
        console.warn("PI cancel:", err);
      }
    }

    const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
    await releaseVariants(getAdminDb(), lines);

    await ref.update({
      paymentStatus: "released",
      fulfillmentStatus: "rejected",
      captureError: FieldValue.delete(),
      repayToken: FieldValue.delete(),
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const releasedData = {
      ...data,
      paymentStatus: "released",
      fulfillmentStatus: "rejected",
    };
    const { notifyShopOrderReleased } = await import("@/lib/shop/order-emails");
    try {
      await notifyShopOrderReleased(id, releasedData, "Order was not approved");
    } catch (e) {
      console.error("shop release email:", e);
    }

    const next = await ref.get();
    return NextResponse.json({
      order: serializeOrder(next.id, next.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("shop release", err);
    return NextResponse.json({ error: "Release failed" }, { status: 500 });
  }
}
