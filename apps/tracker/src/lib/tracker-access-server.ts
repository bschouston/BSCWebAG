import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { normalizeTrackerEmail, trackerEmailDocId } from "@bsc/shared";
import { getTrackerAccessConfig, isGoogleEmailAuthorizedForTracker } from "./tracker-audit";

const ACCESS_CONFIG_PATH = "trackerAccess/config";

export async function setTrackerAccessConfig(
  adminDb: Firestore,
  publicGoogleLogin: boolean,
  updatedBy: string
): Promise<void> {
  await adminDb.doc(ACCESS_CONFIG_PATH).set(
    {
      publicGoogleLogin,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function listAuthorizedTrackerEmails(adminDb: Firestore) {
  const snap = await adminDb.collection("trackerAuthorizedEmails").orderBy("email").get();
  return snap.docs.map((d) => {
    const data = d.data() as { email?: string; label?: string; addedAt?: Timestamp };
    return {
      id: d.id,
      email: data.email ?? d.id,
      label: data.label ?? "",
      addedAt: data.addedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

export async function addAuthorizedTrackerEmail(
  adminDb: Firestore,
  email: string,
  addedBy: string,
  label?: string
): Promise<void> {
  const normalized = normalizeTrackerEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Valid email is required");
  }
  await adminDb
    .collection("trackerAuthorizedEmails")
    .doc(trackerEmailDocId(normalized))
    .set({
      email: normalized,
      label: label?.trim() || null,
      addedAt: Timestamp.now(),
      addedBy,
    });
}

export async function removeAuthorizedTrackerEmail(
  adminDb: Firestore,
  email: string
): Promise<void> {
  const normalized = normalizeTrackerEmail(email);
  await adminDb.collection("trackerAuthorizedEmails").doc(trackerEmailDocId(normalized)).delete();
}

export type TrackerSessionResult =
  | { ok: true; role: "TRACKER" | "ADMIN" | "SUPER_ADMIN" }
  | { ok: false; error: string; status: number };

/**
 * Validate tracker login and provision Google users when allowed.
 * Email/password tablet accounts must already have TRACKER (or admin) role.
 */
export async function completeTrackerSession(
  adminDb: Firestore,
  adminAuth: Auth,
  params: {
    uid: string;
    email: string | null;
    displayName: string | null;
    signInProvider: string | null;
  }
): Promise<TrackerSessionResult> {
  const userRef = adminDb.collection("users").doc(params.uid);
  const userSnap = await userRef.get();
  const existing = userSnap.data() as
    | {
        role?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        isActive?: boolean;
        trackerDisabled?: boolean;
      }
    | undefined;

  if (existing?.isActive === false || existing?.trackerDisabled === true) {
    return { ok: false, error: "This tracker account is disabled", status: 403 };
  }

  const role = existing?.role;
  const isGoogle = params.signInProvider === "google.com";

  // Site admins may use Google public tracker access — mark them for the Admin list
  // without changing their platform role or granting Sports/settings.
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    if (isGoogle) {
      const email = normalizeTrackerEmail(params.email ?? existing?.email ?? "");
      if (email) {
        await userRef.set(
          {
            isGoogleTracker: true,
            isTrackerDevice: false,
            isTrackerAdmin: false,
            trackerSessionActive: true,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      }
    }
    return { ok: true, role };
  }
  if (isGoogle) {
    const email = normalizeTrackerEmail(params.email ?? existing?.email ?? "");
    if (!email) {
      return { ok: false, error: "Google account must have an email address", status: 403 };
    }

    const allowed = await isGoogleEmailAuthorizedForTracker(adminDb, email);
    if (!allowed) {
      return {
        ok: false,
        error: "This Google account is not authorized for tracker access",
        status: 403,
      };
    }

    if (role && role !== "TRACKER" && role !== "MEMBER") {
      return { ok: false, error: "Account role is not permitted for tracker", status: 403 };
    }

    const nameParts = String(params.displayName ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? email.split("@")[0] ?? "Tracker";
    const lastName = nameParts.slice(1).join(" ");
    const now = Timestamp.now();

    await userRef.set(
      {
        uid: params.uid,
        email,
        firstName,
        lastName,
        photoURL: null,
        role: "TRACKER",
        tokenBalance: (existing as { tokenBalance?: number } | undefined)?.tokenBalance ?? 0,
        isActive: true,
        isGoogleTracker: true,
        isTrackerDevice: false,
        isTrackerAdmin: false,
        trackerSessionActive: true,
        updatedAt: now,
        ...(userSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true }
    );
    await adminAuth.setCustomUserClaims(params.uid, { role: "TRACKER" });
    return { ok: true, role: "TRACKER" };
  }

  if (role === "TRACKER") {
    await userRef.set(
      {
        trackerSessionActive: true,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    return { ok: true, role: "TRACKER" };
  }

  return {
    ok: false,
    error: "Your account does not have tracker access",
    status: 403,
  };
}

export { getTrackerAccessConfig };
