import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { getStripe, stripeModeFromLivemode } from "@/lib/stripe-wallet";
import { serializeOrder } from "@/lib/shop/serialize";

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
      return NextResponse.json({ error: "Order is not awaiting capture" }, { status: 400 });
    }
    const piId = typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    if (!piId) {
      return NextResponse.json({ error: "Missing payment intent" }, { status: 400 });
    }

    const stripe = getStripe(stripeModeFromLivemode(data.stripeLivemode === true));
    try {
      await stripe.paymentIntents.capture(piId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Capture failed";
      await ref.update({
        captureError: message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await ref.update({
      paymentStatus: "paid",
      fulfillmentStatus: "ready",
      captureError: FieldValue.delete(),
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const next = await ref.get();
    return NextResponse.json({
      order: serializeOrder(next.id, next.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("shop capture", err);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
}
