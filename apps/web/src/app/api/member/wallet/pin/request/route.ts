import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { issueWalletPin, type WalletPinPurpose } from "@/lib/wallet-pin";

export const dynamic = "force-dynamic";

const PURPOSES: WalletPinPurpose[] = ["transfer", "prefs", "card"];

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { purpose?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const purpose = String(body.purpose ?? "") as WalletPinPurpose;
  if (!PURPOSES.includes(purpose)) {
    return NextResponse.json(
      { error: "purpose must be transfer, prefs, or card" },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = snap.data()!;
    const email = typeof user.email === "string" ? user.email : decoded.email;
    if (!email) {
      return NextResponse.json({ error: "No email on account" }, { status: 400 });
    }
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";

    const result = await issueWalletPin({
      uid: decoded.uid,
      email,
      name,
      purpose,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt,
      message: "PIN sent to your email",
    });
  } catch (err) {
    console.error("POST /api/member/wallet/pin/request error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
