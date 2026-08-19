import "server-only";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type StripeMode = "live" | "test";

const API_VERSION = "2026-01-28.clover" as const;

type CardFieldNames = {
  customerId: string;
  paymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
};

function cardFieldNames(mode: StripeMode): CardFieldNames {
  if (mode === "test") {
    return {
      customerId: "stripeCustomerIdTest",
      paymentMethodId: "defaultPaymentMethodIdTest",
      brand: "cardBrandTest",
      last4: "cardLast4Test",
      expMonth: "cardExpMonthTest",
      expYear: "cardExpYearTest",
    };
  }
  return {
    customerId: "stripeCustomerId",
    paymentMethodId: "defaultPaymentMethodId",
    brand: "cardBrand",
    last4: "cardLast4",
    expMonth: "cardExpMonth",
    expYear: "cardExpYear",
  };
}

export function walletModeFromUser(data: Record<string, unknown> | undefined | null): StripeMode {
  return data?.walletStripeMode === "test" ? "test" : "live";
}

export function stripeModeFromLivemode(livemode: boolean | null | undefined): StripeMode {
  return livemode === false ? "test" : "live";
}

/** Checkout Session / PI ids include `_test_` in test mode (`cs_test_…`, `pi_test_…` is NOT the pattern — it's `cs_test_` vs `cs_live_`). */
export function stripeModeFromObjectId(id: string): StripeMode {
  return /_test_/.test(id) ? "test" : "live";
}

export function isStripeTestConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY_TEST?.trim());
}

export function constructStripeWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const liveSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const testSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST?.trim();
  if (!liveSecret && !testSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  let lastErr: unknown;
  if (liveSecret) {
    try {
      return getStripe("live").webhooks.constructEvent(rawBody, signature, liveSecret);
    } catch (err) {
      lastErr = err;
    }
  }
  if (testSecret) {
    try {
      return getStripe("test").webhooks.constructEvent(rawBody, signature, testSecret);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Webhook signature verification failed");
}

export async function withStripeForPaymentIntent<T>(
  piId: string,
  preferred: StripeMode,
  fn: (stripe: Stripe) => Promise<T>
): Promise<T> {
  const order: StripeMode[] =
    preferred === "test" ? ["test", "live"] : ["live", "test"];
  let lastErr: unknown;
  for (const mode of order) {
    if (mode === "test" && !isStripeTestConfigured()) continue;
    try {
      return await fn(getStripe(mode));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`PaymentIntent not found: ${piId}`);
}

export function getStripe(mode: StripeMode = "live") {
  const key =
    mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) {
    throw new Error(
      mode === "test" ? "STRIPE_SECRET_KEY_TEST is not set" : "STRIPE_SECRET_KEY is not set"
    );
  }
  return new Stripe(key, {
    apiVersion: API_VERSION as any,
  });
}

export type WalletCardSummary = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  paymentMethodId: string | null;
};

export function cardSummaryFromUser(
  data: Record<string, unknown> | undefined,
  mode?: StripeMode
): WalletCardSummary {
  const resolved = mode ?? walletModeFromUser(data);
  const f = cardFieldNames(resolved);
  return {
    brand: typeof data?.[f.brand] === "string" ? (data[f.brand] as string) : null,
    last4: typeof data?.[f.last4] === "string" ? (data[f.last4] as string) : null,
    expMonth: typeof data?.[f.expMonth] === "number" ? (data[f.expMonth] as number) : null,
    expYear: typeof data?.[f.expYear] === "number" ? (data[f.expYear] as number) : null,
    paymentMethodId:
      typeof data?.[f.paymentMethodId] === "string" ? (data[f.paymentMethodId] as string) : null,
  };
}

function customerIdFromUser(data: Record<string, unknown>, mode: StripeMode): string | null {
  const f = cardFieldNames(mode);
  const existing = data[f.customerId];
  return typeof existing === "string" && existing.startsWith("cus_") ? existing : null;
}

/** Ensure the user has a Stripe Customer in the given (or current wallet) mode. */
export async function getOrCreateStripeCustomer(
  uid: string,
  mode?: StripeMode
): Promise<string> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const resolved = mode ?? walletModeFromUser(data);
  if (resolved === "test" && !isStripeTestConfigured()) {
    throw new Error("STRIPE_SECRET_KEY_TEST is not set");
  }

  const existing = customerIdFromUser(data, resolved);
  if (existing) return existing;

  const stripe = getStripe(resolved);
  const customer = await stripe.customers.create({
    email: typeof data.email === "string" ? data.email : undefined,
    name: [data.firstName, data.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { firebaseUid: uid, walletStripeMode: resolved },
  });

  const f = cardFieldNames(resolved);
  await userRef.update({
    [f.customerId]: customer.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return customer.id;
}

export async function persistDefaultPaymentMethod(
  uid: string,
  paymentMethodId: string,
  mode?: StripeMode
): Promise<WalletCardSummary> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const resolved = mode ?? walletModeFromUser(data);
  const stripe = getStripe(resolved);
  const f = cardFieldNames(resolved);
  const customerId = customerIdFromUser(data, resolved) ?? (await getOrCreateStripeCustomer(uid, resolved));

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  const card = pm.card;
  const summary: WalletCardSummary = {
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
    paymentMethodId,
  };

  await userRef.update({
    [f.paymentMethodId]: paymentMethodId,
    [f.brand]: summary.brand,
    [f.last4]: summary.last4,
    [f.expMonth]: summary.expMonth,
    [f.expYear]: summary.expYear,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return summary;
}

export async function clearDefaultPaymentMethod(uid: string, mode?: StripeMode): Promise<void> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const resolved = mode ?? walletModeFromUser(data);
  const f = cardFieldNames(resolved);
  await userRef.update({
    [f.paymentMethodId]: null,
    [f.brand]: null,
    [f.last4]: null,
    [f.expMonth]: null,
    [f.expYear]: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function detachCardsForMode(uid: string, mode: StripeMode): Promise<void> {
  if (mode === "test" && !isStripeTestConfigured()) {
    await clearDefaultPaymentMethod(uid, mode);
    return;
  }
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const customerId = customerIdFromUser(data, mode);
  if (customerId) {
    const stripe = getStripe(mode);
    try {
      const listed = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 100,
      });
      for (const pm of listed.data) {
        try {
          await stripe.paymentMethods.detach(pm.id);
        } catch (err) {
          console.error("detach payment method", pm.id, err);
        }
      }
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: "" },
      });
    } catch (err) {
      console.error("detachCardsForMode", mode, err);
    }
  }
  await clearDefaultPaymentMethod(uid, mode);
}

/** Detach Stripe wallet cards and clear cached brand/last4. Keeps the Customer. */
export async function detachWalletPaymentMethods(
  uid: string,
  modes: StripeMode[] | "all" | "current" = "current"
): Promise<void> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const list: StripeMode[] =
    modes === "all"
      ? ["live", "test"]
      : modes === "current"
        ? [walletModeFromUser(data)]
        : modes;
  for (const mode of list) {
    await detachCardsForMode(uid, mode);
  }
}

export function isCardExpired(
  expMonth: number | null | undefined,
  expYear: number | null | undefined,
  now = new Date()
): boolean {
  if (!expMonth || !expYear) return true;
  const end = new Date(expYear, expMonth, 0, 23, 59, 59, 999);
  return end.getTime() < now.getTime();
}

/**
 * Re-fetch the member’s default payment method from Stripe and refresh cached
 * brand/last4/exp on the user doc. Clears PM fields if the method is gone.
 */
export async function refreshDefaultPaymentMethodFromStripe(
  uid: string,
  mode?: StripeMode
): Promise<WalletCardSummary> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const resolved = mode ?? walletModeFromUser(data);
  const stripe = getStripe(resolved);
  const f = cardFieldNames(resolved);
  const customerId = customerIdFromUser(data, resolved);
  let paymentMethodId =
    typeof data[f.paymentMethodId] === "string" ? (data[f.paymentMethodId] as string) : null;

  if (!customerId) {
    return cardSummaryFromUser(data, resolved);
  }

  const empty = async (): Promise<WalletCardSummary> => {
    await clearDefaultPaymentMethod(uid, resolved);
    return {
      brand: null,
      last4: null,
      expMonth: null,
      expYear: null,
      paymentMethodId: null,
    };
  };

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return empty();
    }
    const defaultPm = customer.invoice_settings?.default_payment_method;
    const fromCustomer =
      typeof defaultPm === "string"
        ? defaultPm
        : defaultPm && typeof defaultPm === "object"
          ? defaultPm.id
          : null;
    if (fromCustomer) paymentMethodId = fromCustomer;
  } catch (err) {
    console.error("refreshDefaultPaymentMethodFromStripe customer:", err);
  }

  if (!paymentMethodId) {
    return empty();
  }

  try {
    return await persistDefaultPaymentMethod(uid, paymentMethodId, resolved);
  } catch (err) {
    console.error("refreshDefaultPaymentMethodFromStripe pm:", err);
    return empty();
  }
}

/** Live Stripe refresh + expiry check for the member’s current wallet mode. */
export async function userHasValidCardLive(uid: string): Promise<{
  valid: boolean;
  card: WalletCardSummary;
  expired: boolean;
}> {
  const card = await refreshDefaultPaymentMethodFromStripe(uid);
  const expired = !card.paymentMethodId || isCardExpired(card.expMonth, card.expYear);
  return {
    valid: Boolean(card.paymentMethodId) && !expired,
    card,
    expired: Boolean(card.paymentMethodId) && isCardExpired(card.expMonth, card.expYear),
  };
}
