import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { getOrCreateStripeCustomer, getStripe, walletModeFromUser } from "@/lib/stripe-wallet";
import { consumeWalletPin } from "@/lib/wallet-pin";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE, isAccountDisabled } from "@/lib/account-status";
import { resolveSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Start Stripe Checkout in setup mode. Requires email PIN. */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { pin?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const pinCheck = await consumeWalletPin({
    uid: decoded.uid,
    purpose: "card",
    pin: String(body.pin ?? ""),
  });
  if (!pinCheck.ok) {
    return NextResponse.json(
      { error: pinCheck.error, code: pinCheck.code },
      { status: 401 }
    );
  }

  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (isAccountDisabled(userSnap.data() as Record<string, unknown> | undefined)) {
      return NextResponse.json(
        { error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE },
        { status: 403 }
      );
    }
    const mode = walletModeFromUser(userSnap.data() as Record<string, unknown> | undefined);
    const stripe = getStripe(mode);
    const customerId = await getOrCreateStripeCustomer(decoded.uid, mode);

    const origin = resolveSiteUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${origin}/member/wallet?setup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/member/wallet?setup=cancelled`,
      metadata: {
        purpose: "wallet_setup",
        firebaseUid: decoded.uid,
        walletStripeMode: mode,
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("POST /api/member/wallet/setup-session error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
