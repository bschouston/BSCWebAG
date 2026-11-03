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
    if (data.paymentStatus === "refunded") {
      return NextResponse.json({ error: "Already refunded" }, { status: 400 });
    }
    if (data.paymentStatus !== "paid") {
      return NextResponse.json({ error: "Only paid orders can be refunded" }, { status: 400 });
    }

    const piId = typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    if (!piId) {
      return NextResponse.json({ error: "Missing payment intent" }, { status: 400 });
    }

    const stripe = getStripe(stripeModeFromLivemode(data.stripeLivemode === true));
    const refund = await stripe.refunds.create({ payment_intent: piId });

    const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
    await releaseVariants(getAdminDb(), lines);

    await ref.update({
      paymentStatus: "refunded",
      fulfillmentStatus: "cancelled",
      stripeRefundId: refund.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const next = await ref.get();
    return NextResponse.json({
      order: serializeOrder(next.id, next.data() as Record<string, unknown>),
      refundId: refund.id,
    });
  } catch (err) {
    console.error("shop refund", err);
    const message = err instanceof Error ? err.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
