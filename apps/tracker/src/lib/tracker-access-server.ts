import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

export type TrackerSessionResult =
  | { ok: true; role: "TRACKER" }
  | { ok: false; error: string; status: number };

/**
 * Validate tracker login for dedicated email/password TRACKER accounts only.
 * Google sign-in is rejected.
 */
export async function completeTrackerSession(
  adminDb: Firestore,
  _adminAuth: Auth,
  params: {
    uid: string;
    email: string | null;
    displayName: string | null;
    signInProvider: string | null;
  }
): Promise<TrackerSessionResult> {
  if (params.signInProvider === "google.com") {
    return {
      ok: false,
      error: "Google sign-in is not supported for Tracker. Use a tablet email and password.",
      status: 403,
    };
  }

  const userRef = adminDb.collection("users").doc(params.uid);
  const userSnap = await userRef.get();
  const existing = userSnap.data() as
    | {
        role?: string;
        isActive?: boolean;
        trackerDisabled?: boolean;
        isTrackerDevice?: boolean;
      }
    | undefined;

  if (!userSnap.exists || !existing) {
    return { ok: false, error: "Your account does not have tracker access", status: 403 };
  }

  if (existing.isActive === false || existing.trackerDisabled === true) {
    return { ok: false, error: "This tracker account is disabled", status: 403 };
  }

  if (existing.role !== "TRACKER") {
    return { ok: false, error: "Your account does not have tracker access", status: 403 };
  }

  await userRef.set(
    {
      trackerSessionActive: true,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  return { ok: true, role: "TRACKER" };
}
