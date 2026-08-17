import { getAdminDb } from "@/lib/firebase/admin";
import { applyTokenLedgerChange } from "@/lib/token-ledger";
import { sendTokenPurchaseReceipt } from "@/lib/email";
import { persistDefaultPaymentMethod, getStripe, stripeModeFromLivemode } from "@/lib/stripe-wallet";
import type Stripe from "stripe";

/**
 * Credit tokens after a successful Stripe Checkout payment for a top-up tier.
 * Idempotent on session id / payment intent id.
 */
export async function creditTokenPurchaseFromCheckout(session: Stripe.Checkout.Session) {
  const uid = session.metadata?.firebaseUid;
  const tokenAmount = Number(session.metadata?.tokenAmount);
  const tierId = session.metadata?.tierId ?? null;
  const tierLabel = session.metadata?.tierLabel ?? null;
  if (!uid || !Number.isInteger(tokenAmount) || tokenAmount <= 0) {
    console.warn("token_purchase session missing uid/tokenAmount", session.id);
    return { ok: false as const, error: "bad_metadata" };
  }

  const idempotencyKey = `purchase_${session.id}`;
  const adminDb = getAdminDb();
  const result = await applyTokenLedgerChange(adminDb, {
    userId: uid,
    type: "CREDIT",
    amount: tokenAmount,
    reason: "purchase",
    description: tierLabel
      ? `Token purchase: ${tierLabel} (${tokenAmount} tokens)`
      : `Token purchase: ${tokenAmount} tokens`,
    idempotencyKey,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    meta: {
      tierId,
      tierLabel,
      checkoutSessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
  });

  // Prefer updating default PM from this payment if present
  try {
    const stripe = getStripe(stripeModeFromLivemode(session.livemode));
    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const pm =
        typeof pi.payment_method === "string"
          ? pi.payment_method
          : pi.payment_method?.id;
      if (pm) await persistDefaultPaymentMethod(uid, pm, stripeModeFromLivemode(session.livemode));
    }
  } catch (err) {
    console.warn("Could not refresh default PM after token purchase:", err);
  }

  if (!result.replayed) {
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data() ?? {};
    const email = typeof user.email === "string" ? user.email : session.customer_details?.email;
    if (email) {
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
      const amountPaid = (session.amount_total ?? 0) / 100;
      sendTokenPurchaseReceipt({
        to: email,
        name,
        tokenAmount,
        amountPaid,
        tierLabel: typeof tierLabel === "string" ? tierLabel : null,
        balanceAfter: result.balance,
        sessionId: session.id,
      }).catch((e) => console.error("token purchase receipt email failed:", e));
    }
  }

  return { ok: true as const, balance: result.balance, replayed: result.replayed };
}

export async function attachCardFromSetupCheckout(session: Stripe.Checkout.Session) {
  const uid = session.metadata?.firebaseUid;
  if (!uid) return { ok: false as const, error: "no_uid" };

  const stripe = getStripe(stripeModeFromLivemode(session.livemode));
  const setupIntentId =
    typeof session.setup_intent === "string"
      ? session.setup_intent
      : session.setup_intent?.id;
  if (!setupIntentId) return { ok: false as const, error: "no_setup_intent" };

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const pmId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;
  if (!pmId) return { ok: false as const, error: "no_pm" };

  const card = await persistDefaultPaymentMethod(uid, pmId, stripeModeFromLivemode(session.livemode));
  return { ok: true as const, card };
}
