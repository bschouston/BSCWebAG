/** Weekly token RSVP flow — not featured tournaments / registration forms. */
export function isWeeklyRsvpEvent(event: { category?: string | null } | null | undefined): boolean {
  return event?.category === "WEEKLY_SPORTS";
}
