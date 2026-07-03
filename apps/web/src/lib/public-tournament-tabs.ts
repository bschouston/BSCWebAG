/** Tab ids for the public tournament page (stored on tournament.publicTabs). */
export const PUBLIC_TOURNAMENT_TAB_IDS = [
  "schedule",
  "scoreboard",
  "leaderboard",
  "standings",
  "live_sheet",
] as const;

export type PublicTournamentTabId = (typeof PUBLIC_TOURNAMENT_TAB_IDS)[number];

export const PUBLIC_TOURNAMENT_TAB_LABELS: Record<PublicTournamentTabId, string> = {
  schedule: "Schedule",
  scoreboard: "Scoreboard",
  leaderboard: "Leaderboard",
  standings: "Standings",
  live_sheet: "Live Sheet",
};

export const DEFAULT_PUBLIC_TABS: PublicTournamentTabId[] = [...PUBLIC_TOURNAMENT_TAB_IDS];

export function isPublicTournamentTabId(value: string): value is PublicTournamentTabId {
  return (PUBLIC_TOURNAMENT_TAB_IDS as readonly string[]).includes(value);
}

/** Returns enabled tabs in display order; defaults to all when unset or invalid. */
export function normalizePublicTabs(tabs?: string[] | null): PublicTournamentTabId[] {
  if (!tabs?.length) return [...DEFAULT_PUBLIC_TABS];
  const valid = tabs.filter(isPublicTournamentTabId);
  return valid.length > 0 ? valid : [...DEFAULT_PUBLIC_TABS];
}
