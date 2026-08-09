import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import {
  normalizeAndValidateMemberProfile,
  normalizePlayerProfile,
} from "@/lib/player-profile";

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
    const playerProfile = normalizePlayerProfile(data.playerProfile, {
      phone: data.phone ?? null,
      age: data.age ?? null,
      height: data.height ?? null,
      weight: data.weight ?? null,
      iceContact: data.iceContact ?? null,
      skillLevels: data.skillLevels ?? null,
    });

    if (!playerProfile.phone && data.phone) {
      playerProfile.phone = data.phone;
    }

    return NextResponse.json({
      uid: decoded.uid,
      email: data.email ?? decoded.email ?? "",
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      photoURL: data.photoURL ?? null,
      phone: data.phone ?? playerProfile.phone ?? null,
      role: data.role ?? "MEMBER",
      tokenBalance: typeof data.tokenBalance === "number" ? data.tokenBalance : 0,
      playerProfile,
    });
  } catch (error) {
    console.error("GET /api/member/profile error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = normalizeAndValidateMemberProfile(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, fieldErrors: validated.fieldErrors },
      { status: 400 }
    );
  }

  const { phone, playerProfile: rawProfile } = validated.data;

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("users").doc(decoded.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = snap.data() ?? {};
    const firstName = typeof existing.firstName === "string" ? existing.firstName : "";
    const lastName = typeof existing.lastName === "string" ? existing.lastName : "";
    const photoURL =
      typeof existing.photoURL === "string" ? existing.photoURL : null;
    const existingPhotoPath =
      existing.playerProfile &&
      typeof existing.playerProfile === "object" &&
      typeof (existing.playerProfile as { photoPath?: unknown }).photoPath === "string"
        ? ((existing.playerProfile as { photoPath: string }).photoPath)
        : null;

    // Preserve Google-owned identity fields; ignore client photoURL/photoPath.
    const playerProfile = {
      ...rawProfile,
      photoPath: existingPhotoPath,
    };

    await ref.update({
      phone: phone || null,
      playerProfile,
      iceContact: playerProfile.iceContact,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      firstName,
      lastName,
      photoURL,
      phone: phone || null,
      playerProfile,
    });
  } catch (error) {
    console.error("PUT /api/member/profile error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
