import "server-only";
import { randomUUID } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { applyTokenLedgerChange } from "@/lib/token-ledger";
import {
  cardSummaryFromUser,
  getOrCreateStripeCustomer,
  getStripe,
  isCardExpired,
  refreshDefaultPaymentMethodFromStripe,
} from "@/lib/stripe-wallet";
import { BILLING_FROZEN_MESSAGE, isBillingFrozen } from "@/lib/billing-freeze";
import { sendAutoTopUpFailedEmail } from "@/lib/email";

const MAX_AUTO_TOPUP_STEPS = 50;

export type AutoTopUpResult =
  | { ok: true; balance: number; stepsCharged: number }
  | { ok: false; error: string; code: string; balance: number };

async function loadActiveTierByTokenAmount(): Promise<
  Map<number, { id: string; tokenAmount: number; priceCents: number; currency: string; label: string | null }>
> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tokenTopUpTiers").get();
  const map = new Map<
    number,
    { id: string; tokenAmount: number; priceCents: number; currency: string; label: string | null }
  >();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.active === false) continue;
    const tokenAmount = Number(data.tokenAmount);
    if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) continue;
    map.set(tokenAmount, {
      id: d.id,
      tokenAmount,
      priceCents: Number(data.priceCents) || 0,
      currency: String(data.currency || "usd"),
      label: typeof data.label === "string" ? data.label : null,
    });
  }
  return map;
}

/**
 * Charge off-session for exact steps until balance >= needed.
 * Credits tokens immediately on each successful PaymentIntent (idempotent by PI id).
 * Stripe create uses a per-run idempotency key so network retries do not double-charge.
 */
export async function ensureTokenBalance(opts: {
  uid: string;
  needed: number;
  /** If true, after reaching needed also top up to minThreshold if still below */
  alsoMeetThreshold?: boolean;
}): Promise<AutoTopUpResult> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(opts.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { ok: false, error: "User not found", code: "NOT_FOUND", balance: 0 };
  }
  const user = snap.data() ?? {};
  let balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;

  if (isBillingFrozen(user as Record<string, unknown>)) {
    return {
      ok: false,
      error: BILLING_FROZEN_MESSAGE,
      code: "BILLING_FROZEN",
      balance,
    };
  }

  const replenishAmount =
    typeof user.tokenReplenishAmount === "number" ? user.tokenReplenishAmount : 0;
  const minThreshold =
    typeof user.tokenMinThreshold === "number" ? user.tokenMinThreshold : 0;

  let target = opts.needed;
  if (opts.alsoMeetThreshold && minThreshold > target) {
    target = minThreshold;
  }

  if (balance >= target) {
    return { ok: true, balance, stepsCharged: 0 };
  }

  let card = cardSummaryFromUser(user as Record<string, unknown>);
  try {
    card = await refreshDefaultPaymentMethodFromStripe(opts.uid);
  } catch (err) {
    console.error("ensureTokenBalance card refresh:", err);
  }
  if (!card.paymentMethodId || isCardExpired(card.expMonth, card.expYear)) {
    return {
      ok: false,
      error: "A valid card on file is required to top up tokens",
      code: "CARD_REQUIRED",
      balance,
    };
  }

  if (!Number.isInteger(replenishAmount) || replenishAmount <= 0) {
    return {
      ok: false,
      error: "Set a replenish amount in Wallet that matches an active pricing tier",
      code: "PREFS_REQUIRED",
      balance,
    };
  }

  const tiers = await loadActiveTierByTokenAmount();
  const tier = tiers.get(replenishAmount);
  if (!tier) {
    return {
      ok: false,
      error: "Replenish amount must match an active Super Admin pricing tier",
      code: "TIER_MISMATCH",
      balance,
    };
  }

  const deficit = target - balance;
  const steps = Math.ceil(deficit / replenishAmount);
  if (steps > MAX_AUTO_TOPUP_STEPS) {
    return {
      ok: false,
      error: `Too many top-up steps required (${steps}). Increase your replenish amount.`,
      code: "TOO_MANY_STEPS",
      balance,
    };
  }

  const stripe = getStripe();
  let customerId: string;
  try {
    customerId = await getOrCreateStripeCustomer(opts.uid);
  } catch {
    return { ok: false, error: "Stripe customer missing", code: "STRIPE_ERROR", balance };
  }

  const runId = randomUUID();
  let stepsCharged = 0;
  for (let i = 0; i < steps; i++) {
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: tier.priceCents,
          currency: tier.currency,
          customer: customerId,
          payment_method: card.paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: {
            purpose: "auto_topup",
            firebaseUid: opts.uid,
            tierId: tier.id,
            tokenAmount: String(tier.tokenAmount),
            step: String(i + 1),
            of: String(steps),
            runId,
          },
        },
        {
          idempotencyKey: `auto_topup_pi_${opts.uid}_${runId}_${i + 1}`,
        }
      );

      if (pi.status !== "succeeded") {
        throw new Error(`Payment status: ${pi.status}`);
      }

      const credit = await applyTokenLedgerChange(adminDb, {
        userId: opts.uid,
        type: "CREDIT",
        amount: tier.tokenAmount,
        reason: "auto_topup",
        description: `Auto top-up: ${tier.tokenAmount} tokens`,
        idempotencyKey: `auto_topup_${pi.id}`,
        stripePaymentIntentId: pi.id,
        meta: { tierId: tier.id, step: i + 1, of: steps, runId },
      });
      balance = credit.balance;
      stepsCharged += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auto top-up charge failed";
      const email = typeof user.email === "string" ? user.email : null;
      if (email) {
        const name =
          [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
        sendAutoTopUpFailedEmail({
          to: email,
          name,
          reason: message,
          needed: target,
          balance,
        }).catch((e) => console.error("auto top-up failure email:", e));
      }
      return {
        ok: false,
        error: `Auto top-up failed: ${message}`,
        code: "CHARGE_FAILED",
        balance,
      };
    }
  }

  if (balance < target) {
    return {
      ok: false,
      error: "Balance still insufficient after top-up",
      code: "INSUFFICIENT_AFTER_TOPUP",
      balance,
    };
  }

  return { ok: true, balance, stepsCharged };
}

/** After a debit, top up to minThreshold if configured. */
export async function topUpToMinThresholdIfNeeded(uid: string): Promise<AutoTopUpResult | null> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const user = snap.data() ?? {};
  if (isBillingFrozen(user as Record<string, unknown>)) return null;
  const balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
  const minThreshold =
    typeof user.tokenMinThreshold === "number" ? user.tokenMinThreshold : 0;
  if (!minThreshold || balance >= minThreshold) return null;
  return ensureTokenBalance({ uid, needed: minThreshold });
}

export function resolveWeeklyTokenHold(event: {
  category?: string;
  tokensRequired?: number;
  tokensMin?: number | null;
  tokensMax?: number | null;
}): { isWeekly: boolean; tokensMin: number; tokensMax: number } {
  const isWeekly = event.category === "WEEKLY_SPORTS";
  const legacy = Number(event.tokensRequired) || 0;
  const tokensMax =
    typeof event.tokensMax === "number" && event.tokensMax > 0
      ? event.tokensMax
      : legacy;
  const tokensMin =
    typeof event.tokensMin === "number" && event.tokensMin > 0
      ? event.tokensMin
      : tokensMax;
  return { isWeekly, tokensMin: Math.min(tokensMin, tokensMax), tokensMax };
}

export function userHasValidCard(user: Record<string, unknown>): boolean {
  const card = cardSummaryFromUser(user);
  return Boolean(card.paymentMethodId) && !isCardExpired(card.expMonth, card.expYear);
}
