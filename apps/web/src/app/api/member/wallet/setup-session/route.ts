import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { getOrCreateStripeCustomer, getStripe } from "@/lib/stripe-wallet";

export const dynamic = "force-dynamic";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Start Stripe Checkout in setup mode to save a card on the member's Customer. */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(decoded.uid);

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${siteUrl()}/member/wallet?setup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/member/wallet?setup=cancelled`,
      metadata: {
        purpose: "wallet_setup",
        firebaseUid: decoded.uid,
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("POST /api/member/wallet/setup-session error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
