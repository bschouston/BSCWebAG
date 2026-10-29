export const MISSING_STAT_TRACKER_MESSAGE =
  "This tournament has no stat tracker. Create one in the tracker app under All trackers, then choose it when creating or converting the tournament.";

export function readStatTrackerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}
