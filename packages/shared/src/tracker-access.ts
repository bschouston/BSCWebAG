/** Normalize emails for allowlist lookups and document ids. */
export function normalizeTrackerEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

export function trackerEmailDocId(email: string): string {
  return normalizeTrackerEmail(email).replace(/\//g, "_");
}

export type TrackerAuditAction =
  | "login"
  | "logout"
  | "lock_acquire"
  | "lock_release"
  | "play_record"
  | "play_delete"
  | "score_adjust"
  | "match_status"
  | "match_simulate"
  | "match_simulate_all"
  | "unlock"
  | "relock";

export const TRACKER_AUDIT_ACTION_LABELS: Record<TrackerAuditAction, string> = {
  login: "Login",
  logout: "Logout",
  lock_acquire: "Started tracking",
  lock_release: "Finished tracking",
  play_record: "Stat recorded",
  play_delete: "Stat deleted",
  score_adjust: "Score adjusted",
  match_status: "Match status",
  match_simulate: "Match simulated",
  match_simulate_all: "Simulated all matches",
  unlock: "Unlocked edit",
  relock: "Re-locked edit",
};
