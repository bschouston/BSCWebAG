import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";
import { reserveVariantsInTx } from "@/lib/shop/inventory";
import { notifyShopOrderConfirmed, notifyShopOrderPlaced } from "@/lib/shop/order-emails";
import type { ShopOrderLine } from "@/lib/shop/types";

/** Mark shop order authorized after Checkout Session completes (manual capture). */
export async function fulfillShopOrderAuthorized(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.shopOrderId;
  if (!orderId) {
    throw new Error("Missing shopOrderId on session metadata");
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("shopOrders").doc(orderId);
  let shouldEmail = false;
  let snapshotData: Record<string, unknown> | null = null;

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
    shouldEmail = true;
    snapshotData = {
      ...data,
      paymentStatus: "authorized",
      fulfillmentStatus: "pending_review",
    };
  });

  if (shouldEmail && snapshotData) {
    // Await so serverless doesn't freeze before Mailjet finishes.
    // Never throw — email failure must not undo authorization / cancel the PI.
    try {
      await notifyShopOrderPlaced(orderId, snapshotData);
    } catch (err) {
      console.error("shop placement email failed:", err);
    }
  }
}

/** Complete shop order after capture-failure re-pay Checkout (automatic capture). */
export async function fulfillShopOrderRepaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.shopOrderId;
  if (!orderId) {
    throw new Error("Missing shopOrderId on session metadata");
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("shopOrders").doc(orderId);
  let shouldEmail = false;
  let snapshotData: Record<string, unknown> | null = null;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Shop order ${orderId} not found`);
    const data = snap.data() as Record<string, unknown>;

    if (data.paymentStatus === "paid") {
      return;
    }
    if (data.paymentStatus !== "capture_failed" && data.paymentStatus !== "pending_repay") {
      throw new Error(`Order ${orderId} is not awaiting re-pay`);
    }

    const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
    await reserveVariantsInTx(tx, adminDb, lines);

    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    tx.update(ref, {
      paymentStatus: "paid",
      fulfillmentStatus: "ready",
      stripeSessionId: session.id,
      stripePaymentIntentId: pi,
      stripeLivemode: session.livemode === true,
      captureError: FieldValue.delete(),
      repayToken: FieldValue.delete(),
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    shouldEmail = true;
    snapshotData = {
      ...data,
      paymentStatus: "paid",
      fulfillmentStatus: "ready",
    };
  });

  if (shouldEmail && snapshotData) {
    try {
      await notifyShopOrderConfirmed(orderId, snapshotData);
    } catch (err) {
      console.error("shop repay confirmation email failed:", err);
    }
  }
}
