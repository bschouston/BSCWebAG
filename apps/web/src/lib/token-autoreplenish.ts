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
  walletModeFromUser,
} from "@/lib/stripe-wallet";
import { BILLING_FROZEN_MESSAGE, isBillingFrozen } from "@/lib/billing-freeze";
import {
  sendAutoReplenishFailedEmail,
  sendAutoReplenishReceipt,
  sendRsvpPackagePurchaseReceipt,
  sendRsvpUnitPurchaseReceipt,
} from "@/lib/email";
import { getTokenPricingConfig } from "@/lib/token-pricing-config";
import { normalizePackageCardColor } from "@/lib/token-packages";

const MAX_AUTO_REPLENISH_STEPS = 50;

export type TokenFundingResult =
  | { ok: true; balance: number; stepsCharged: number }
  | { ok: false; error: string; code: string; balance: number };

type PackageRow = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  label: string | null;
};

async function loadActivePackageById(packageId: string): Promise<PackageRow | null> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tokenPackages").doc(packageId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (data.active === false) return null;
  const tokenAmount = Number(data.tokenAmount);
  if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) return null;
  return {
    id: snap.id,
    tokenAmount,
    priceCents: Number(data.priceCents) || 0,
    currency: String(data.currency || "usd"),
    label: typeof data.label === "string" ? data.label : null,
  };
}

export async function loadActivePackagesForMember(): Promise<
  Array<{
    id: string;
    tokenAmount: number;
    priceCents: number;
    currency: string;
    label: string | null;
    cardColor: string;
    sortOrder: number;
  }>
> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tokenPackages").get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        tokenAmount: Number(data.tokenAmount) || 0,
        priceCents: Number(data.priceCents) || 0,
        currency: String(data.currency || "usd"),
        label: typeof data.label === "string" ? data.label : null,
        cardColor: normalizePackageCardColor(data.cardColor),
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
        active: data.active !== false,
      };
    })
    .filter((p) => p.active && p.tokenAmount > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.tokenAmount - b.tokenAmount)
    .map(({ active: _active, ...rest }) => rest);
}

async function chargeOffSessionAndCredit(opts: {
  uid: string;
  user: Record<string, unknown>;
  card: { paymentMethodId: string };
  amountCents: number;
  currency: string;
  tokenAmount: number;
  reason: "auto_replenish" | "unit_purchase" | "package_purchase";
  description: string;
  purpose: string;
  metadata: Record<string, string>;
  idempotencyKeyPrefix: string;
  meta?: Record<string, unknown>;
  eventId?: string;
}): Promise<{ balance: number; paymentIntentId: string }> {
  const adminDb = getAdminDb();
  const stripe = getStripe(walletModeFromUser(opts.user));
  const customerId = await getOrCreateStripeCustomer(opts.uid);

  const pi = await stripe.paymentIntents.create(
    {
      amount: opts.amountCents,
      currency: opts.currency,
      customer: customerId,
      payment_method: opts.card.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        ...opts.metadata,
        purpose: opts.purpose,
        firebaseUid: opts.uid,
        tokenAmount: String(opts.tokenAmount),
        walletStripeMode: walletModeFromUser(opts.user),
      },
    },
    { idempotencyKey: opts.idempotencyKeyPrefix }
  );

  if (pi.status !== "succeeded") {
    throw new Error(`Payment status: ${pi.status}`);
  }

  const credit = await applyTokenLedgerChange(adminDb, {
    userId: opts.uid,
    type: "CREDIT",
    amount: opts.tokenAmount,
    reason: opts.reason,
    description: opts.description,
    idempotencyKey: `${opts.purpose}_${pi.id}`,
    stripePaymentIntentId: pi.id,
    eventId: opts.eventId ?? null,
    meta: opts.meta,
  });

  return { balance: credit.balance, paymentIntentId: pi.id };
}

async function getUserCardAndBalance(uid: string): Promise<{
  user: Record<string, unknown>;
  balance: number;
  card: ReturnType<typeof cardSummaryFromUser>;
}> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const user = snap.data() ?? {};
  let balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
  let card = cardSummaryFromUser(user as Record<string, unknown>);
  try {
    card = await refreshDefaultPaymentMethodFromStripe(uid);
  } catch (err) {
    console.error("getUserCardAndBalance card refresh:", err);
  }
  return { user: user as Record<string, unknown>, balance, card };
}

function cardRequiredResult(balance: number): TokenFundingResult {
  return {
    ok: false,
    error: "A valid card on file is required to purchase tokens",
    code: "CARD_REQUIRED",
    balance,
  };
}

/**
 * Auto replenish using the member's selected package — only when pref is set.
 * Charges the package repeatedly until balance >= needed.
 */
export async function autoReplenishIfNeeded(opts: {
  uid: string;
  needed: number;
  eventId?: string;
  eventTraceLabel?: string;
}): Promise<TokenFundingResult> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(opts.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { ok: false, error: "User not found", code: "NOT_FOUND", balance: 0 };
  }
  const user = snap.data() ?? {};
  let balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;

  if (isBillingFrozen(user as Record<string, unknown>)) {
    return { ok: false, error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN", balance };
  }

  if (balance >= opts.needed) {
    return { ok: true, balance, stepsCharged: 0 };
  }

  const packageId =
    typeof user.tokenAutoReplenishPackageId === "string"
      ? user.tokenAutoReplenishPackageId
      : null;
  if (!packageId) {
    return {
      ok: false,
      error: "Insufficient tokens",
      code: "INSUFFICIENT_TOKENS",
      balance,
    };
  }

  const pkg = await loadActivePackageById(packageId);
  if (!pkg) {
    return {
      ok: false,
      error: "Your auto replenish package is no longer available. Choose a new package in Wallet.",
      code: "PACKAGE_UNAVAILABLE",
      balance,
    };
  }

  let card = cardSummaryFromUser(user as Record<string, unknown>);
  try {
    card = await refreshDefaultPaymentMethodFromStripe(opts.uid);
  } catch (err) {
    console.error("autoReplenishIfNeeded card refresh:", err);
  }
  if (!card.paymentMethodId || isCardExpired(card.expMonth, card.expYear)) {
    return cardRequiredResult(balance);
  }

  const deficit = opts.needed - balance;
  const steps = Math.ceil(deficit / pkg.tokenAmount);
  if (steps > MAX_AUTO_REPLENISH_STEPS) {
    return {
      ok: false,
      error: `Too many auto replenish charges required (${steps}). Choose a larger package.`,
      code: "TOO_MANY_STEPS",
      balance,
    };
  }

  const runId = randomUUID();
  let stepsCharged = 0;
  for (let i = 0; i < steps; i++) {
    try {
      const result = await chargeOffSessionAndCredit({
        uid: opts.uid,
        user: user as Record<string, unknown>,
        card: { paymentMethodId: card.paymentMethodId! },
        amountCents: pkg.priceCents,
        currency: pkg.currency,
        tokenAmount: pkg.tokenAmount,
        reason: "auto_replenish",
        description: opts.eventTraceLabel
          ? `Auto replenish: ${pkg.tokenAmount} tokens for ${opts.eventTraceLabel}`
          : `Auto replenish: ${pkg.tokenAmount} tokens`,
        purpose: "auto_replenish",
        metadata: {
          packageId: pkg.id,
          step: String(i + 1),
          of: String(steps),
          runId,
          ...(opts.eventId ? { eventId: opts.eventId } : {}),
        },
        idempotencyKeyPrefix: `auto_replenish_pi_${opts.uid}_${runId}_${i + 1}`,
        meta: {
          packageId: pkg.id,
          step: i + 1,
          of: steps,
          runId,
          ...(opts.eventId ? { eventId: opts.eventId } : {}),
        },
        eventId: opts.eventId,
      });
      balance = result.balance;
      stepsCharged += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auto replenish charge failed";
      const email = typeof user.email === "string" ? user.email : null;
      if (email) {
        const name =
          [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
        sendAutoReplenishFailedEmail({
          to: email,
          name,
          reason: message,
          needed: opts.needed,
          balance,
          eventSlug: opts.eventTraceLabel ?? null,
        }).catch((e) => console.error("auto replenish failure email:", e));
      }
      return {
        ok: false,
        error: `Auto replenish failed: ${message}`,
        code: "CHARGE_FAILED",
        balance,
      };
    }
  }

  if (balance < opts.needed) {
    return {
      ok: false,
      error: "Balance still insufficient after auto replenish",
      code: "INSUFFICIENT_AFTER_REPLENISH",
      balance,
    };
  }

  if (stepsCharged > 0) {
    const email = typeof user.email === "string" ? user.email : null;
    if (email) {
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
      sendAutoReplenishReceipt({
        to: email,
        name,
        tokenAmount: stepsCharged * pkg.tokenAmount,
        amountPaid: (stepsCharged * pkg.priceCents) / 100,
        charges: stepsCharged,
        balanceAfter: balance,
        packageLabel: pkg.label || `${pkg.tokenAmount} tokens`,
        eventSlug: opts.eventTraceLabel ?? null,
      }).catch((e) => console.error("auto replenish receipt email failed:", e));
    }
  }

  return { ok: true, balance, stepsCharged };
}

export async function purchaseExactTokensAtRsvp(opts: {
  uid: string;
  tokenCount: number;
  eventId?: string;
  eventTitle: string;
  eventTraceLabel?: string;
  requestId?: string;
}): Promise<TokenFundingResult> {
  if (!Number.isInteger(opts.tokenCount) || opts.tokenCount <= 0) {
    return { ok: false, error: "Invalid token count", code: "INVALID_PURCHASE", balance: 0 };
  }

  const pricing = await getTokenPricingConfig();
  if (!Number.isInteger(pricing.unitPriceCents) || pricing.unitPriceCents <= 0) {
    return {
      ok: false,
      error: "Unit token price is not configured",
      code: "UNIT_PRICE_UNAVAILABLE",
      balance: 0,
    };
  }

  let { user, balance, card } = await getUserCardAndBalance(opts.uid);
  if (isBillingFrozen(user)) {
    return { ok: false, error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN", balance };
  }
  if (!card.paymentMethodId || isCardExpired(card.expMonth, card.expYear)) {
    return cardRequiredResult(balance);
  }

  const amountCents = opts.tokenCount * pricing.unitPriceCents;
  const runId = randomUUID();

  const trace = opts.eventTraceLabel || opts.eventTitle;
  const forRequest = Boolean(opts.requestId);
  const description = forRequest
    ? `Token request purchase: ${opts.tokenCount} tokens (${trace})`
    : `RSVP purchase: ${opts.tokenCount} tokens for ${trace}`;
  const metadata: Record<string, string> = { runId };
  if (opts.eventId) metadata.eventId = opts.eventId;
  if (opts.requestId) metadata.requestId = opts.requestId;

  try {
    const result = await chargeOffSessionAndCredit({
      uid: opts.uid,
      user,
      card: { paymentMethodId: card.paymentMethodId },
      amountCents,
      currency: pricing.currency,
      tokenAmount: opts.tokenCount,
      reason: "unit_purchase",
      description,
      purpose: "unit_purchase",
      metadata,
      idempotencyKeyPrefix: `unit_purchase_pi_${opts.uid}_${runId}`,
      meta: {
        runId,
        ...(opts.eventId ? { eventId: opts.eventId } : {}),
        ...(opts.requestId ? { requestId: opts.requestId } : {}),
      },
      eventId: opts.eventId,
    });
    balance = result.balance;

    const email = typeof user.email === "string" ? user.email : null;
    if (email) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
      sendRsvpUnitPurchaseReceipt({
        to: email,
        name,
        tokenAmount: opts.tokenCount,
        amountPaid: amountCents / 100,
        balanceAfter: balance,
        eventTitle: opts.eventTraceLabel || opts.eventTitle,
      }).catch((e) => console.error("rsvp unit purchase receipt email:", e));
    }

    return { ok: true, balance, stepsCharged: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Purchase failed";
    return { ok: false, error: `Purchase failed: ${message}`, code: "CHARGE_FAILED", balance };
  }
}

export async function purchasePackageAtRsvp(opts: {
  uid: string;
  packageId: string;
  eventId?: string;
  eventTitle: string;
  eventTraceLabel?: string;
  requestId?: string;
}): Promise<TokenFundingResult> {
  const pkg = await loadActivePackageById(opts.packageId);
  if (!pkg) {
    return {
      ok: false,
      error: "Package not found or inactive",
      code: "PACKAGE_UNAVAILABLE",
      balance: 0,
    };
  }

  let { user, balance, card } = await getUserCardAndBalance(opts.uid);
  if (isBillingFrozen(user)) {
    return { ok: false, error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN", balance };
  }
  if (!card.paymentMethodId || isCardExpired(card.expMonth, card.expYear)) {
    return cardRequiredResult(balance);
  }

  const runId = randomUUID();
  const trace = opts.eventTraceLabel || opts.eventTitle;
  const forRequest = Boolean(opts.requestId);
  const pkgLabel = pkg.label || `${pkg.tokenAmount} tokens`;
  const description = forRequest
    ? `Token request package purchase: ${pkgLabel} (${trace})`
    : `RSVP package purchase: ${pkgLabel} for ${trace}`;
  const metadata: Record<string, string> = { packageId: pkg.id, runId };
  if (opts.eventId) metadata.eventId = opts.eventId;
  if (opts.requestId) metadata.requestId = opts.requestId;

  try {
    const result = await chargeOffSessionAndCredit({
      uid: opts.uid,
      user,
      card: { paymentMethodId: card.paymentMethodId },
      amountCents: pkg.priceCents,
      currency: pkg.currency,
      tokenAmount: pkg.tokenAmount,
      reason: "package_purchase",
      description,
      purpose: "package_purchase",
      metadata,
      idempotencyKeyPrefix: `package_purchase_pi_${opts.uid}_${runId}`,
      meta: {
        packageId: pkg.id,
        runId,
        ...(opts.eventId ? { eventId: opts.eventId } : {}),
        ...(opts.requestId ? { requestId: opts.requestId } : {}),
      },
      eventId: opts.eventId,
    });
    balance = result.balance;

    const email = typeof user.email === "string" ? user.email : null;
    if (email) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
      sendRsvpPackagePurchaseReceipt({
        to: email,
        name,
        tokenAmount: pkg.tokenAmount,
        amountPaid: pkg.priceCents / 100,
        balanceAfter: balance,
        eventTitle: opts.eventTraceLabel || opts.eventTitle,
        packageLabel: pkg.label || `${pkg.tokenAmount} tokens`,
      }).catch((e) => console.error("rsvp package purchase receipt email:", e));
    }

    return { ok: true, balance, stepsCharged: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Purchase failed";
    return { ok: false, error: `Purchase failed: ${message}`, code: "CHARGE_FAILED", balance };
  }
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

export async function buildInsufficientTokensPayload(uid: string, needed: number) {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  const balance = snap.exists && typeof snap.data()?.tokenBalance === "number"
    ? snap.data()!.tokenBalance
    : 0;
  const shortfall = Math.max(0, needed - balance);
  const pricing = await getTokenPricingConfig();
  const packages = await loadActivePackagesForMember();
  return {
    code: "INSUFFICIENT_TOKENS" as const,
    balance,
    needed,
    shortfall,
    unitPriceCents: pricing.unitPriceCents,
    currency: pricing.currency,
    packages,
  };
}
