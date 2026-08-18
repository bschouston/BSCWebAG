import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { consumeWalletPin } from "@/lib/wallet-pin";

export const dynamic = "force-dynamic";

/** Save auto replenish package preference. Requires email PIN. */
export async function PUT(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    tokenAutoReplenishPackageId?: unknown;
    pin?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pinCheck = await consumeWalletPin({
    uid: decoded.uid,
    purpose: "prefs",
    pin: String(body.pin ?? ""),
  });
  if (!pinCheck.ok) {
    return NextResponse.json(
      { error: pinCheck.error, code: pinCheck.code },
      { status: 401 }
    );
  }

  const rawId = body.tokenAutoReplenishPackageId;
  const packageId =
    rawId === null || rawId === ""
      ? null
      : typeof rawId === "string"
        ? rawId
        : undefined;

  if (packageId === undefined) {
    return NextResponse.json(
      { error: "tokenAutoReplenishPackageId must be a package id or null" },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    if (packageId) {
      const pkgSnap = await adminDb.collection("tokenPackages").doc(packageId).get();
      if (!pkgSnap.exists || pkgSnap.data()?.active === false) {
        return NextResponse.json(
          { error: "Package not found or inactive" },
          { status: 400 }
        );
      }
    }

    await adminDb.collection("users").doc(decoded.uid).update({
      tokenAutoReplenishPackageId: packageId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      tokenAutoReplenishPackageId: packageId,
    });
  } catch (err) {
    console.error("PUT /api/member/wallet/prefs error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
