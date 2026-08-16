import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import {
  normalizeAndValidateMemberProfile,
  normalizePlayerProfile,
} from "@/lib/player-profile";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const { uid } = await params;
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("users").doc(uid).get();
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
      uid,
      email: data.email ?? "",
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      photoURL: data.photoURL ?? null,
      phone: data.phone ?? playerProfile.phone ?? null,
      role: data.role ?? "MEMBER",
      tokenBalance: typeof data.tokenBalance === "number" ? data.tokenBalance : 0,
      isActive: data.isActive !== false,
      playerProfile,
    });
  } catch (err) {
    console.error("GET /api/admin/users/[uid]/profile error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;

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
    const ref = adminDb.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = snap.data() ?? {};
    const existingPhotoPath =
      existing.playerProfile &&
      typeof existing.playerProfile === "object" &&
      typeof (existing.playerProfile as { photoPath?: unknown }).photoPath === "string"
        ? (existing.playerProfile as { photoPath: string }).photoPath
        : null;

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

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "profile.update",
    });

    return NextResponse.json({
      ok: true,
      phone: phone || null,
      playerProfile,
    });
  } catch (err) {
    console.error("PUT /api/admin/users/[uid]/profile error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
