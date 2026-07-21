import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeTrackerEmail, trackerEmailDocId } from "@bsc/shared";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

function isManagedTrackerAccount(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.isTrackerDevice === true) return true;
  if (data.isGoogleTracker === true) return true;
  return data.role === "TRACKER";
}

/** Enable/disable a tracker account, reset password, or toggle tablet admin. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const { uid } = await params;

  const userDoc = await adminDb.collection("users").doc(uid).get();
  const userData = userDoc.data() as Record<string, unknown> | undefined;
  if (!userDoc.exists || !userData || !isManagedTrackerAccount(userData)) {
    return NextResponse.json({ error: "Tracker account not found" }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const authUpdates: { disabled?: boolean; password?: string } = {};
    const firestoreUpdates: Record<string, unknown> = {};
    const isTablet = userData.isTrackerDevice === true;
    const isPlatformAdmin =
      userData.role === "ADMIN" || userData.role === "SUPER_ADMIN";

    if (body.disabled !== undefined) {
      const disabled = Boolean(body.disabled);
      firestoreUpdates.trackerDisabled = disabled;
      if (disabled) {
        firestoreUpdates.trackerSessionActive = false;
      }
      // Dedicated tracker accounts: also disable Firebase Auth.
      // Never disable Auth / isActive for platform admins (would lock them out of Admin).
      if (isTablet || (userData.role === "TRACKER" && !isPlatformAdmin)) {
        authUpdates.disabled = disabled;
        firestoreUpdates.isActive = !disabled;
      }
    }
    if (body.password !== undefined) {
      if (!isTablet) {
        return NextResponse.json(
          { error: "Password reset is only available for tablet logins" },
          { status: 400 }
        );
      }
      const password = String(body.password);
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
      authUpdates.password = password;
    }
    if (body.isTrackerAdmin !== undefined) {
      if (!isTablet) {
        return NextResponse.json(
          { error: "Only tablet tracker logins can be tracker admins" },
          { status: 400 }
        );
      }
      firestoreUpdates.isTrackerAdmin = body.isTrackerAdmin === true;
    }

    if (Object.keys(authUpdates).length === 0 && Object.keys(firestoreUpdates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    if (Object.keys(authUpdates).length > 0) {
      await adminAuth.updateUser(uid, authUpdates);
    }
    if (Object.keys(firestoreUpdates).length > 0) {
      await adminDb.collection("users").doc(uid).update({
        ...firestoreUpdates,
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update tracker account error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Delete a tracker login.
 * - Tablet / Google TRACKER: delete Auth user + Firestore user doc; remove allowlist email.
 * - Platform ADMIN Google: clear tracker flags only (keep Admin account).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const { uid } = await params;

  const userDoc = await adminDb.collection("users").doc(uid).get();
  const userData = userDoc.data() as Record<string, unknown> | undefined;
  if (!userDoc.exists || !userData || !isManagedTrackerAccount(userData)) {
    return NextResponse.json({ error: "Tracker account not found" }, { status: 404 });
  }

  try {
    const email = normalizeTrackerEmail(String(userData.email ?? ""));
    const isPlatformAdmin =
      userData.role === "ADMIN" || userData.role === "SUPER_ADMIN";

    if (email) {
      await adminDb
        .collection("trackerAuthorizedEmails")
        .doc(trackerEmailDocId(email))
        .delete()
        .catch(() => undefined);
    }

    if (isPlatformAdmin) {
      await adminDb.collection("users").doc(uid).update({
        isGoogleTracker: false,
        trackerDisabled: false,
        trackerSessionActive: false,
        isTrackerAdmin: false,
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json({ ok: true, mode: "cleared" });
    }

    try {
      await adminAuth.deleteUser(uid);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/user-not-found") throw err;
    }
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({ ok: true, mode: "deleted" });
  } catch (err) {
    console.error("Delete tracker account error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
