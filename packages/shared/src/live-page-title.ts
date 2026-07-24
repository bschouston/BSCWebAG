/** Public tournament / registration title for the men's national volleyball tournament. */
export const LIVE_VOLLEYBALL_DISPLAY_NAME = "Men's Volleyball Tournament 1448H";

function isVolleyballStatTrackerId(statTrackerId: string): boolean {
  return statTrackerId.startsWith("volleyball");
}

/** Display name for tournament lists + public Live (volleyball uses branded title). */
export function livePageTitle(raw: string, statTrackerId?: string): string {
  if (statTrackerId && isVolleyballStatTrackerId(statTrackerId)) {
    return LIVE_VOLLEYBALL_DISPLAY_NAME;
  }
  const s = raw.trim();
  const stripped = s.replace(/^registration\s*-\s*/i, "").trim();
  return stripped || s || "Tournament";
}

/** Nav label for featured registration events (Registration dropdown). */
export function registrationNavTitle(title: string, registrationFormType?: string): string {
  if (registrationFormType === "volleyball") {
    return LIVE_VOLLEYBALL_DISPLAY_NAME;
  }
  return livePageTitle(title);
}
