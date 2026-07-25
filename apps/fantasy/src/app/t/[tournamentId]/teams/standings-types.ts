export type FantasyTeamRow = {
  id: string;
  teamName?: string;
  ownerDisplayName?: string;
  photoUrl?: string | null;
  playerIds?: string[];
  isMine?: boolean;
  effectivelyLocked?: boolean;
};

export type TopScorerInfo = {
  displayName: string;
  number: number | null;
  points: number;
  topStats: { label: string; value: number; color?: string }[];
};

export type RankedTeam = FantasyTeamRow & {
  rank: number;
  fantasyPoints: number;
  budgetUsed: number;
  budgetUnused: number | null;
  budgetPct: number | null;
  topScorer: TopScorerInfo | null;
};

export type StandingsProps = {
  tournamentId: string;
  teams: RankedTeam[];
  allRanked: RankedTeam[];
  page: number;
  searching: boolean;
  maxBudget: number | null;
};
