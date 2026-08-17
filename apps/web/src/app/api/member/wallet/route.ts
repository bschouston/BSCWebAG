import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import {
  cardSummaryFromUser,
  getOrCreateStripeCustomer,
  isCardExpired,
} from "@/lib/stripe-wallet";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const card = cardSummaryFromUser(data as Record<string, unknown>);
    const expired = isCardExpired(card.expMonth, card.expYear);

    return NextResponse.json({
      balance: typeof data.tokenBalance === "number" ? data.tokenBalance : 0,
      stripeCustomerId: data.stripeCustomerId ?? null,
      card,
      cardValid: Boolean(card.paymentMethodId) && !expired,
      cardExpired: Boolean(card.paymentMethodId) && expired,
      tokenMinThreshold:
        typeof data.tokenMinThreshold === "number" ? data.tokenMinThreshold : 0,
      tokenReplenishAmount:
        typeof data.tokenReplenishAmount === "number" ? data.tokenReplenishAmount : null,
    });
  } catch (err) {
    console.error("GET /api/member/wallet error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Ensure Stripe customer exists (lazy). */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const customerId = await getOrCreateStripeCustomer(decoded.uid);
    return NextResponse.json({ ok: true, stripeCustomerId: customerId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("POST /api/member/wallet error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
