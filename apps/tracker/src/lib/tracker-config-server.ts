import { Timestamp } from "firebase-admin/firestore";
import {
  TrackerConfigSchema,
  defaultVolleyballTrackerConfig,
  statTrackers,
  type TrackerConfig,
} from "@bsc/shared";
import { getAdminDb } from "./firebase/admin";
import { verifyPasscodeHash } from "./passcode";

export function isKnownSport(sport: string): boolean {
  return statTrackers.some((t) => t.sport === sport);
}

export function configRef(sport: string) {
  return getAdminDb().collection("trackerConfigs").doc(sport);
}

/** Private security doc (passcode hash); denied to clients in firestore.rules. */
export function securityRef(sport: string) {
  return configRef(sport).collection("private").doc("security");
}

/** Read the sport config, lazily seeding volleyball defaults when missing. */
export async function getOrSeedTrackerConfig(sport: string): Promise<TrackerConfig> {
  const ref = configRef(sport);
  const snap = await ref.get();
  if (snap.exists) {
    return TrackerConfigSchema.parse(snap.data());
  }
  if (sport !== "volleyball") throw new Error(`No tracker config for sport: ${sport}`);
  const seeded = defaultVolleyballTrackerConfig();
  await ref.set({ ...seeded, updatedAt: Timestamp.now().toDate().toISOString() });
  return seeded;
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_LOCKOUT_MS = 15 * 60 * 1000;

export type PasscodeCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Verify the sport passcode against the stored hash, with a small lockout
 * after repeated failures. All verification is server-side; clients only ever
 * send the candidate passcode over an authenticated API call.
 */
export async function checkPasscode(sport: string, passcode: string): Promise<PasscodeCheck> {
  const ref = securityRef(sport);
  const snap = await ref.get();
  const data = snap.data() as
    | { hash?: string; salt?: string; failedAttempts?: number; lockUntil?: number }
    | undefined;

  if (!data?.hash || !data?.salt) {
    return {
      ok: false,
      status: 409,
      error: "No passcode configured. Set one in tracker settings first.",
    };
  }

  const now = Date.now();
  if (data.lockUntil && data.lockUntil > now) {
    const mins = Math.ceil((data.lockUntil - now) / 60000);
    return { ok: false, status: 429, error: `Too many attempts. Try again in ${mins} min.` };
  }

  if (!verifyPasscodeHash(passcode, data.hash, data.salt)) {
    const failed = (data.failedAttempts ?? 0) + 1;
    await ref.set(
      failed >= MAX_FAILED_ATTEMPTS
        ? { failedAttempts: 0, lockUntil: now + ATTEMPT_LOCKOUT_MS }
        : { failedAttempts: failed },
      { merge: true }
    );
    return { ok: false, status: 403, error: "Incorrect passcode" };
  }

  if (data.failedAttempts || data.lockUntil) {
    await ref.set({ failedAttempts: 0, lockUntil: null }, { merge: true });
  }
  return { ok: true };
}
