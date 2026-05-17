import { isVolleyballStatTrackerId } from "@/lib/live-volleyball-sheet";

/** Public Live UI title for the men's national volleyball tournament. */
export const LIVE_VOLLEYBALL_DISPLAY_NAME =
  "1448H mens national volleyball tournament";

/** Display name for public Live listing + detail (volleyball uses branded title). */
export function livePageTitle(raw: string, statTrackerId?: string): string {
  if (statTrackerId && isVolleyballStatTrackerId(statTrackerId)) {
    return LIVE_VOLLEYBALL_DISPLAY_NAME;
  }
  const s = raw.trim();
  const stripped = s.replace(/^registration\s*-\s*/i, "").trim();
  return stripped || s || "Tournament";
}
