import "server-only";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, {
    // Match other routes in this repo
    apiVersion: "2026-01-28.clover" as any,
  });
}

export type WalletCardSummary = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  paymentMethodId: string | null;
};

/** Ensure the user has a Stripe Customer; store id on users/{uid}. */
export async function getOrCreateStripeCustomer(uid: string): Promise<string> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = snap.data() ?? {};
  const existing = data.stripeCustomerId;
  if (typeof existing === "string" && existing.startsWith("cus_")) {
    return existing;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: typeof data.email === "string" ? data.email : undefined,
    name: [data.firstName, data.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { firebaseUid: uid },
  });

  await userRef.update({
    stripeCustomerId: customer.id,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return customer.id;
}

export async function persistDefaultPaymentMethod(
  uid: string,
  paymentMethodId: string
): Promise<WalletCardSummary> {
  const stripe = getStripe();
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const customerId =
    typeof snap.data()?.stripeCustomerId === "string"
      ? snap.data()!.stripeCustomerId
      : await getOrCreateStripeCustomer(uid);

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
    defaultPaymentMethodId: paymentMethodId,
    cardBrand: summary.brand,
    cardLast4: summary.last4,
    cardExpMonth: summary.expMonth,
    cardExpYear: summary.expYear,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return summary;
}

export function cardSummaryFromUser(data: Record<string, unknown> | undefined): WalletCardSummary {
  return {
    brand: typeof data?.cardBrand === "string" ? data.cardBrand : null,
    last4: typeof data?.cardLast4 === "string" ? data.cardLast4 : null,
    expMonth: typeof data?.cardExpMonth === "number" ? data.cardExpMonth : null,
    expYear: typeof data?.cardExpYear === "number" ? data.cardExpYear : null,
    paymentMethodId:
      typeof data?.defaultPaymentMethodId === "string"
        ? data.defaultPaymentMethodId
        : null,
  };
}

export function isCardExpired(
  expMonth: number | null | undefined,
  expYear: number | null | undefined,
  now = new Date()
): boolean {
  if (!expMonth || !expYear) return true;
  const end = new Date(expYear, expMonth, 0, 23, 59, 59, 999); // last day of exp month
  return end.getTime() < now.getTime();
}

/**
 * Re-fetch the member’s default payment method from Stripe and refresh cached
 * brand/last4/exp on the user doc. Clears PM fields if the method is gone.
 */
export async function refreshDefaultPaymentMethodFromStripe(
  uid: string
): Promise<WalletCardSummary> {
  const stripe = getStripe();
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const data = snap.data() ?? {};
  const customerId =
    typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null;
  let paymentMethodId =
    typeof data.defaultPaymentMethodId === "string"
      ? data.defaultPaymentMethodId
      : null;

  if (!customerId) {
    return cardSummaryFromUser(data as Record<string, unknown>);
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      await userRef.update({
        defaultPaymentMethodId: null,
        cardBrand: null,
        cardLast4: null,
        cardExpMonth: null,
        cardExpYear: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        paymentMethodId: null,
      };
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
    await userRef.update({
      defaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      brand: null,
      last4: null,
      expMonth: null,
      expYear: null,
      paymentMethodId: null,
    };
  }

  try {
    return await persistDefaultPaymentMethod(uid, paymentMethodId);
  } catch (err) {
    console.error("refreshDefaultPaymentMethodFromStripe pm:", err);
    await userRef.update({
      defaultPaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      brand: null,
      last4: null,
      expMonth: null,
      expYear: null,
      paymentMethodId: null,
    };
  }
}

/** Live Stripe refresh + expiry check. */
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
