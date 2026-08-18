import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getOrCreateStripeCustomer,
  getStripe,
  isCardExpired,
  refreshDefaultPaymentMethodFromStripe,
  walletModeFromUser,
} from "@/lib/stripe-wallet";
import {
  BILLING_FROZEN_MESSAGE,
  isBillingFrozen,
} from "@/lib/billing-freeze";

export const dynamic = "force-dynamic";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Buy an active token package via Stripe Checkout (credits applied on webhook). */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { packageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  if (!packageId) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 });
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

    const pkgSnap = await adminDb.collection("tokenPackages").doc(packageId).get();
    if (!pkgSnap.exists || pkgSnap.data()?.active === false) {
      return NextResponse.json({ error: "Package not found or inactive" }, { status: 404 });
    }
    const pkg = pkgSnap.data()!;
    const tokenAmount = Number(pkg.tokenAmount);
    const priceCents = Number(pkg.priceCents);
    const currency = String(pkg.currency || "usd").toLowerCase();
    if (!Number.isInteger(tokenAmount) || tokenAmount <= 0 || !Number.isInteger(priceCents)) {
      return NextResponse.json({ error: "Invalid package configuration" }, { status: 400 });
    }

    const mode = walletModeFromUser(user as Record<string, unknown>);
    const stripe = getStripe(mode);
    const customerId = await getOrCreateStripeCustomer(decoded.uid, mode);
    const label =
      typeof pkg.label === "string" && pkg.label
        ? pkg.label
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
              name: `Token package: ${label}`,
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
          packageId,
          tokenAmount: String(tokenAmount),
          packageLabel: label,
          walletStripeMode: mode,
        },
      },
      metadata: {
        purpose: "token_purchase",
        firebaseUid: decoded.uid,
        packageId,
        tokenAmount: String(tokenAmount),
        packageLabel: label,
        priceCents: String(priceCents),
        walletStripeMode: mode,
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
