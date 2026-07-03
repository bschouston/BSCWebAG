import { getStatTracker } from "@bsc/shared";

/**
 * Helpers for the set/match locking model.
 *
 * A set is locked once it ends (setNumber < currentSet) and the whole match
 * is locked once COMPLETED. Edits to locked scopes require a passcode-issued
 * `editUnlock` on the match doc, written only by the unlock API after
 * verifying the 4-digit passcode server-side. Firestore rules deny all client
 * writes to matches/plays, so this check cannot be bypassed.
 */

export type EditUnlock = {
  scope: "set" | "match";
  setNumber: number | null;
  /** Epoch ms. */
  expiresAt: number;
  unlockedBy: string;
};

export function sportFromStatTrackerId(statTrackerId: string): string {
  try {
    return getStatTracker(statTrackerId).sport;
  } catch {
    // e.g. "volleyball.v1" -> "volleyball"
    return statTrackerId.split(".")[0] || statTrackerId;
  }
}

export function getActiveUnlock(match: { editUnlock?: EditUnlock | null }): EditUnlock | null {
  const u = match.editUnlock;
  if (!u || typeof u.expiresAt !== "number" || u.expiresAt <= Date.now()) return null;
  return u;
}

/** Whether an active unlock authorizes edits to the given set. */
export function unlockCoversSet(unlock: EditUnlock | null, setNumber: number): boolean {
  if (!unlock) return false;
  if (unlock.scope === "match") return true;
  return unlock.setNumber === setNumber;
}

export type SetScore = { a: number; b: number };

/**
 * Count completed-set wins per team. For IN_PROGRESS matches only sets before
 * the current one count; for COMPLETED matches every set counts (tied or
 * empty trailing sets count for neither team).
 */
export function completedSetWins(
  setScores: SetScore[],
  status: string,
  currentSet: number
): { a: number; b: number } {
  const upTo =
    status === "COMPLETED" ? setScores.length : Math.min(currentSet - 1, setScores.length);
  let a = 0;
  let b = 0;
  for (let i = 0; i < upTo; i++) {
    const s = setScores[i];
    if (s.a > s.b) a++;
    else if (s.b > s.a) b++;
  }
  return { a, b };
}
