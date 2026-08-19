import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { PLAYER_GENDERS, emptyPlayerProfile, type PlayerGender } from "@/lib/player-profile";

export const dynamic = "force-dynamic";

/** Set gender during complete-profile without requiring the full profile form. */
export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { gender?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gender = String(body.gender ?? "");
  if (!(PLAYER_GENDERS as readonly string[]).includes(gender)) {
    return NextResponse.json({ error: "Select male or female" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("users").doc(decoded.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const existing = snap.data()?.playerProfile;
    const base =
      existing && typeof existing === "object"
        ? existing
        : emptyPlayerProfile();
    await ref.update({
      playerProfile: {
        ...base,
        version: 1,
        gender: gender as PlayerGender,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, gender });
  } catch (err) {
    console.error("POST /api/member/profile/gender error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
