import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { reserveVariantsInTx } from "@/lib/shop/inventory";
import type { ShopOrderLine } from "@/lib/shop/types";

/** Mark shop order authorized after Checkout Session completes (manual capture). */
export async function fulfillShopOrderAuthorized(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.shopOrderId;
  if (!orderId) {
    throw new Error("Missing shopOrderId on session metadata");
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("shopOrders").doc(orderId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Shop order ${orderId} not found`);
    const data = snap.data() as Record<string, unknown>;

    if (data.paymentStatus === "authorized" || data.paymentStatus === "paid") {
      return; // idempotent
    }

    const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
    await reserveVariantsInTx(tx, adminDb, lines);

    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    tx.update(ref, {
      paymentStatus: "authorized",
      fulfillmentStatus: "pending_review",
      stripeSessionId: session.id,
      stripePaymentIntentId: pi,
      stripeLivemode: session.livemode === true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
