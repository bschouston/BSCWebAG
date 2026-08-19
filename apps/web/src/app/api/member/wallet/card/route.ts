import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { detachWalletPaymentMethods } from "@/lib/stripe-wallet";
import { ACCOUNT_DISABLED_CODE, ACCOUNT_DISABLED_MESSAGE, isAccountDisabled } from "@/lib/account-status";

export const dynamic = "force-dynamic";

/** Detach the member’s current-mode wallet card from Stripe. */
export async function DELETE(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (isAccountDisabled(snap.data() as Record<string, unknown>)) {
      return NextResponse.json(
        { error: ACCOUNT_DISABLED_MESSAGE, code: ACCOUNT_DISABLED_CODE },
        { status: 403 }
      );
    }

    await detachWalletPaymentMethods(decoded.uid, "current");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/member/wallet/card error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
