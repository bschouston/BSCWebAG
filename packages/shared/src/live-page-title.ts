/** Display name for tournament lists, public Live, and the Registration menu. */
export function livePageTitle(raw: string, _statTrackerId?: string): string {
  void _statTrackerId;
  const s = raw.trim();
  const stripped = s.replace(/^registration\s*-\s*/i, "").trim();
  return stripped || s || "Tournament";
}

/** Nav label for featured registration events (Registration dropdown). */
export function registrationNavTitle(title: string, _registrationFormType?: string): string {
  void _registrationFormType;
  return livePageTitle(title);
}
