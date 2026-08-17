import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** Save auto top-up prefs. replenishAmount must match an active tier. */
export async function PUT(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tokenMinThreshold?: unknown; tokenReplenishAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tokenMinThreshold = Number(body.tokenMinThreshold);
  const tokenReplenishAmount = Number(body.tokenReplenishAmount);

  if (!Number.isInteger(tokenMinThreshold) || tokenMinThreshold < 0) {
    return NextResponse.json(
      { error: "Minimum threshold must be a whole number ≥ 0" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(tokenReplenishAmount) || tokenReplenishAmount <= 0) {
    return NextResponse.json(
      { error: "Replenish amount must be a positive whole number matching a tier" },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const tiersSnap = await adminDb.collection("tokenTopUpTiers").get();
    const match = tiersSnap.docs.find((d) => {
      const data = d.data();
      return data.active !== false && Number(data.tokenAmount) === tokenReplenishAmount;
    });
    if (!match) {
      return NextResponse.json(
        { error: "Replenish amount must equal an active pricing tier’s token count" },
        { status: 400 }
      );
    }

    await adminDb.collection("users").doc(decoded.uid).update({
      tokenMinThreshold,
      tokenReplenishAmount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      tokenMinThreshold,
      tokenReplenishAmount,
    });
  } catch (err) {
    console.error("PUT /api/member/wallet/prefs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
