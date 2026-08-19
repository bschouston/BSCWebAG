import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import {
  detachWalletPaymentMethods,
  getStripe,
  persistDefaultPaymentMethod,
  stripeModeFromLivemode,
  stripeModeFromObjectId,
} from "@/lib/stripe-wallet";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE, isAccountDisabled } from "@/lib/account-status";

export const dynamic = "force-dynamic";

/** After Checkout setup success: attach PM as default from session id. */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (isAccountDisabled(userSnap.data() as Record<string, unknown> | undefined)) {
      return NextResponse.json(
        { error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE },
        { status: 403 }
      );
    }

    const stripe = getStripe(stripeModeFromObjectId(sessionId));
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent"],
    });

    if (session.metadata?.firebaseUid && session.metadata.firebaseUid !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (session.mode !== "setup" || session.status !== "complete") {
      return NextResponse.json({ error: "Setup session not complete" }, { status: 400 });
    }

    const setupIntent =
      typeof session.setup_intent === "string"
        ? await stripe.setupIntents.retrieve(session.setup_intent)
        : session.setup_intent;

    const pmId =
      typeof setupIntent?.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent?.payment_method && typeof setupIntent.payment_method === "object"
          ? setupIntent.payment_method.id
          : null;

    if (!pmId) {
      return NextResponse.json({ error: "No payment method on setup" }, { status: 400 });
    }

    const persistMode = stripeModeFromLivemode(session.livemode);
    const card = await persistDefaultPaymentMethod(decoded.uid, pmId, persistMode);

    return NextResponse.json({ ok: true, card });
  } catch (err) {
    console.error("POST /api/member/wallet/confirm-setup error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Detach default card from Stripe (same as DELETE /api/member/wallet/card). */
export async function DELETE(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const snap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (isAccountDisabled(snap.data() as Record<string, unknown> | undefined)) {
      return NextResponse.json(
        { error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE },
        { status: 403 }
      );
    }
    await detachWalletPaymentMethods(decoded.uid, "current");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/member/wallet/confirm-setup error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
