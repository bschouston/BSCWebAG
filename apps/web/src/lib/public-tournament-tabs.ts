/** Tab ids for the public tournament page (stored on tournament.publicTabs). */
export const PUBLIC_TOURNAMENT_TAB_IDS = [
  "schedule",
  "scoreboard",
  "leaderboard",
  "standings",
  "teams",
  "playoffs",
  "live_sheet",
] as const;

export type PublicTournamentTabId = (typeof PUBLIC_TOURNAMENT_TAB_IDS)[number];

export const PUBLIC_TOURNAMENT_TAB_LABELS: Record<PublicTournamentTabId, string> = {
  schedule: "Schedule",
  scoreboard: "Scoreboard",
  leaderboard: "Leaderboard",
  standings: "Standings",
  teams: "Teams",
  playoffs: "Playoffs",
  live_sheet: "Live Sheet",
};

/** Defaults exclude playoffs/teams so unfinished public surfaces stay opt-in. */
export const DEFAULT_PUBLIC_TABS: PublicTournamentTabId[] = [
  "schedule",
  "scoreboard",
  "leaderboard",
  "standings",
  "live_sheet",
];

export function isPublicTournamentTabId(value: string): value is PublicTournamentTabId {
  return (PUBLIC_TOURNAMENT_TAB_IDS as readonly string[]).includes(value);
}

/** Returns enabled tabs in display order; defaults when unset or invalid. */
export function normalizePublicTabs(tabs?: string[] | null): PublicTournamentTabId[] {
  if (!tabs?.length) return [...DEFAULT_PUBLIC_TABS];
  const valid = tabs.filter(isPublicTournamentTabId);
  return valid.length > 0 ? valid : [...DEFAULT_PUBLIC_TABS];
}
