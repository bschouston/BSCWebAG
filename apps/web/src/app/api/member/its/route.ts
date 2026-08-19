import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { claimItsNumber } from "@/lib/its-claim";
import { clubRoleNeedsIts } from "@/lib/its-number";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { itsNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const role = String(snap.data()?.role ?? "MEMBER");
    if (!clubRoleNeedsIts(role)) {
      return NextResponse.json({ error: "This account type does not use ITS#" }, { status: 403 });
    }

    const result = await claimItsNumber(decoded.uid, String(body.itsNumber ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, itsNumber: result.itsNumber });
  } catch (err) {
    console.error("POST /api/member/its error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
