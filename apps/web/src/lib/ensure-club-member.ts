import { Timestamp } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isClubMemberRole } from "@/lib/member-access";

export type EnsureClubMemberResult = {
  role: string;
  promoted: boolean;
};

function isFantasyPasswordAdmin(data: Record<string, unknown>): boolean {
  return data.isFantasyAdmin === true && data.fantasyAuthType === "password";
}

/**
 * Upgrade Fantasy Google players (role FANTASY) to club MEMBER so ITS/gender
 * onboarding can run. Never touches Fantasy password admins or tablet trackers.
 */
export async function ensureClubMemberForUid(
  adminDb: Firestore,
  adminAuth: Auth,
  uid: string
): Promise<EnsureClubMemberResult> {
  const ref = adminDb.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return { role: "MEMBER", promoted: false };
  }

  const data = snap.data() as Record<string, unknown>;
  const currentRole = typeof data.role === "string" ? data.role : "";

  if (data.isTrackerDevice === true) {
    return { role: currentRole || "TRACKER", promoted: false };
  }
  if (isFantasyPasswordAdmin(data)) {
    return { role: currentRole || "FANTASY", promoted: false };
  }
  if (isClubMemberRole(currentRole)) {
    return { role: currentRole, promoted: false };
  }
  if (currentRole === "TRACKER") {
    return { role: "TRACKER", promoted: false };
  }

  // FANTASY or missing/unknown non-club role → MEMBER
  const updates: Record<string, unknown> = {
    role: "MEMBER",
    updatedAt: Timestamp.now(),
  };
  if (typeof data.tokenBalance !== "number") {
    updates.tokenBalance = 0;
  }
  if (data.isActive === undefined) {
    updates.isActive = true;
  }

  await ref.set(updates, { merge: true });

  try {
    const authUser = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
      ...(authUser.customClaims ?? {}),
      role: "MEMBER",
    });
  } catch {
    // claims optional
  }

  return { role: "MEMBER", promoted: true };
}
