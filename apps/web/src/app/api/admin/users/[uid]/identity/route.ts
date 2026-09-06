import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { getAdminAuth, getAdminDb, getAdminStorage } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const MAX_NAME = 60;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function extForType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  const contentType = file.type || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("Photo must be an image file");
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Photo must be under 5 MB");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `profile-photos/${uid}/${Date.now()}.${extForType(contentType)}`;
  const bucket = getAdminStorage().bucket();
  const gcsFile = bucket.file(path);
  const token = randomUUID();
  await gcsFile.save(buf, {
    contentType,
    metadata: {
      cacheControl: "public,max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

function namesFromDisplayName(displayName: string | null | undefined) {
  const parts = (displayName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: (parts[0] || "").slice(0, MAX_NAME),
    lastName: parts.slice(1).join(" ").slice(0, MAX_NAME),
  };
}

/** Restore Firestore + Auth profile fields from the Google provider record. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (String(body.action ?? "").toLowerCase() !== "reset") {
    return NextResponse.json({ error: "action must be reset" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const before = snap.data() ?? {};

    const authUser = await adminAuth.getUser(uid);
    const google = authUser.providerData.find((p) => p.providerId === "google.com");
    if (!google) {
      return NextResponse.json(
        { error: "This account has no Google sign-in provider to restore from" },
        { status: 400 }
      );
    }

    const { firstName, lastName } = namesFromDisplayName(google.displayName);
    const photoURL = google.photoURL ?? null;
    const displayName =
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      google.displayName?.trim() ||
      "Member";

    await adminAuth.updateUser(uid, {
      displayName,
      photoURL,
    });

    await userRef.update({
      firstName,
      lastName,
      photoURL,
      identityOverride: false,
      identityOverrideAt: FieldValue.delete(),
      identityOverrideBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "identity.reset",
      meta: {
        before: {
          firstName: before.firstName ?? "",
          lastName: before.lastName ?? "",
          photoURL: before.photoURL ?? null,
          identityOverride: before.identityOverride === true,
        },
        after: { firstName, lastName, photoURL, identityOverride: false },
      },
    });

    const updated = await userRef.get();
    return NextResponse.json({
      ok: true,
      user: { id: uid, ...updated.data() },
    });
  } catch (err) {
    console.error("POST /api/admin/users/[uid]/identity", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let firstName = "";
    let lastName = "";
    let clearPhoto = false;
    let photoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      firstName = String(form.get("firstName") ?? "");
      lastName = String(form.get("lastName") ?? "");
      clearPhoto = String(form.get("clearPhoto") ?? "") === "true";
      const file = form.get("photo");
      if (file instanceof File && file.size > 0) photoFile = file;
    } else {
      let body: {
        firstName?: unknown;
        lastName?: unknown;
        clearPhoto?: unknown;
      };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
      firstName = String(body.firstName ?? "");
      lastName = String(body.lastName ?? "");
      clearPhoto = Boolean(body.clearPhoto);
    }

    firstName = firstName.trim().slice(0, MAX_NAME);
    lastName = lastName.trim().slice(0, MAX_NAME);
    if (!firstName && !lastName) {
      return NextResponse.json(
        { error: "Enter at least a first or last name" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const before = snap.data() ?? {};

    let nextPhotoURL: string | null | undefined = undefined;
    if (clearPhoto) {
      nextPhotoURL = null;
    } else if (photoFile) {
      nextPhotoURL = await uploadProfilePhoto(uid, photoFile);
    }

    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const authUpdate: { displayName: string; photoURL?: string | null } = {
      displayName: displayName || "Member",
    };
    if (nextPhotoURL !== undefined) {
      authUpdate.photoURL = nextPhotoURL;
    }
    await adminAuth.updateUser(uid, authUpdate);

    const firestoreUpdate: Record<string, unknown> = {
      firstName,
      lastName,
      identityOverride: true,
      identityOverrideAt: FieldValue.serverTimestamp(),
      identityOverrideBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (nextPhotoURL !== undefined) {
      firestoreUpdate.photoURL = nextPhotoURL;
    }
    await userRef.update(firestoreUpdate);

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "identity.update",
      meta: {
        before: {
          firstName: before.firstName ?? "",
          lastName: before.lastName ?? "",
          photoURL: before.photoURL ?? null,
        },
        after: {
          firstName,
          lastName,
          photoURL:
            nextPhotoURL !== undefined ? nextPhotoURL : (before.photoURL ?? null),
        },
        clearPhoto,
        photoUploaded: Boolean(photoFile),
      },
    });

    const updated = await userRef.get();
    return NextResponse.json({
      ok: true,
      user: { id: uid, ...updated.data() },
    });
  } catch (err) {
    console.error("PUT /api/admin/users/[uid]/identity", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
