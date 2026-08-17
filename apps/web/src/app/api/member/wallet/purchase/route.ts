import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getOrCreateStripeCustomer,
  getStripe,
  isCardExpired,
  refreshDefaultPaymentMethodFromStripe,
} from "@/lib/stripe-wallet";
import {
  BILLING_FROZEN_MESSAGE,
  isBillingFrozen,
} from "@/lib/billing-freeze";

export const dynamic = "force-dynamic";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Buy an active top-up tier via Stripe Checkout (credits applied on webhook). */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tierId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tierId = typeof body.tierId === "string" ? body.tierId : "";
  if (!tierId) {
    return NextResponse.json({ error: "tierId required" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = userSnap.data() ?? {};

    if (isBillingFrozen(user as Record<string, unknown>)) {
      return NextResponse.json(
        { error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN" },
        { status: 403 }
      );
    }

    let card;
    try {
      card = await refreshDefaultPaymentMethodFromStripe(decoded.uid);
    } catch {
      card = null;
    }
    const expMonth =
      card?.expMonth ?? (typeof user.cardExpMonth === "number" ? user.cardExpMonth : null);
    const expYear =
      card?.expYear ?? (typeof user.cardExpYear === "number" ? user.cardExpYear : null);
    const pmId = card?.paymentMethodId ?? user.defaultPaymentMethodId;

    if (typeof pmId !== "string" || !pmId || isCardExpired(expMonth, expYear)) {
      return NextResponse.json(
        { error: "A valid card on file is required before purchasing tokens" },
        { status: 400 }
      );
    }

    const tierSnap = await adminDb.collection("tokenTopUpTiers").doc(tierId).get();
    if (!tierSnap.exists || tierSnap.data()?.active === false) {
      return NextResponse.json({ error: "Tier not found or inactive" }, { status: 404 });
    }
    const tier = tierSnap.data()!;
    const tokenAmount = Number(tier.tokenAmount);
    const priceCents = Number(tier.priceCents);
    const currency = String(tier.currency || "usd").toLowerCase();
    if (!Number.isInteger(tokenAmount) || tokenAmount <= 0 || !Number.isInteger(priceCents)) {
      return NextResponse.json({ error: "Invalid tier configuration" }, { status: 400 });
    }

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(decoded.uid);
    const label =
      typeof tier.label === "string" && tier.label
        ? tier.label
        : `${tokenAmount} tokens`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: `Token top-up: ${label}`,
              description: `${tokenAmount} club tokens`,
            },
          },
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          purpose: "token_purchase",
          firebaseUid: decoded.uid,
          tierId,
          tokenAmount: String(tokenAmount),
          tierLabel: label,
        },
      },
      metadata: {
        purpose: "token_purchase",
        firebaseUid: decoded.uid,
        tierId,
        tokenAmount: String(tokenAmount),
        tierLabel: label,
        priceCents: String(priceCents),
      },
      success_url: `${siteUrl()}/member/wallet?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/member/wallet?purchase=cancelled`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("POST /api/member/wallet/purchase error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
