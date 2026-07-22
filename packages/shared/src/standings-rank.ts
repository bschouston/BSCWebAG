import type { StandingsConfig, StandingsCriterionId, StandingsPoints } from "./standings-config";
import { resolveStandingsConfig } from "./standings-config";

export type StandingsTeamInput = {
  id: string;
  name: string;
};

export type StandingsTeamStatsInput = {
  teamId: string;
  wins?: number;
  losses?: number;
  setsWon?: number;
  setsLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
};

export type StandingsMatchInput = {
  id: string;
  status: string;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string | null;
};

export type StandingsRow = {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDifferential: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  tournamentPoints: number;
};

function n(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Classify a completed match set score for tourney points (2–0 vs 2–1, etc.). */
export function classifyMatchSets(
  scoreA: number,
  scoreB: number
): { winnerSets: number; loserSets: number } | null {
  const a = n(scoreA);
  const b = n(scoreB);
  if (a === b) return null;
  if (a > b) return { winnerSets: a, loserSets: b };
  return { winnerSets: b, loserSets: a };
}

function pointsForWinner(points: StandingsPoints, winnerSets: number, loserSets: number): number {
  // Best-of-3 style: 2–0 → winIn2Sets, 2–1 → winIn3Sets; also handle larger set totals
  if (loserSets === 0) return points.winIn2Sets;
  return points.winIn3Sets;
}

/** Tournament points earned by a team in one completed match. */
export function matchTournamentPointsForTeam(
  match: StandingsMatchInput,
  teamId: string,
  points: StandingsPoints
): number {
  if (match.status !== "COMPLETED") return 0;
  if (match.teamAId !== teamId && match.teamBId !== teamId) return 0;

  const winnerId = match.winnerTeamId ?? null;
  if (!winnerId) {
    return points.tie;
  }

  const classified = classifyMatchSets(n(match.scoreA), n(match.scoreB));
  if (winnerId === teamId) {
    if (!classified) return points.winIn2Sets;
    return pointsForWinner(points, classified.winnerSets, classified.loserSets);
  }
  // Loser
  return points.loss;
}

export function computeTournamentPoints(
  teamId: string,
  matches: StandingsMatchInput[],
  points: StandingsPoints
): number {
  let total = 0;
  for (const m of matches) {
    total += matchTournamentPointsForTeam(m, teamId, points);
  }
  return total;
}

function buildRows(
  teams: StandingsTeamInput[],
  teamStats: StandingsTeamStatsInput[],
  matches: StandingsMatchInput[],
  points: StandingsPoints
): StandingsRow[] {
  const statsById = new Map(teamStats.map((s) => [s.teamId, s]));
  return teams.map((t) => {
    const s = statsById.get(t.id);
    const wins = n(s?.wins);
    const losses = n(s?.losses);
    const setsWon = n(s?.setsWon);
    const setsLost = n(s?.setsLost);
    const pointsFor = n(s?.pointsFor);
    const pointsAgainst = n(s?.pointsAgainst);
    return {
      teamId: t.id,
      name: t.name,
      wins,
      losses,
      setsWon,
      setsLost,
      setDifferential: setsWon - setsLost,
      pointsFor,
      pointsAgainst,
      pointDifferential: pointsFor - pointsAgainst,
      tournamentPoints: computeTournamentPoints(t.id, matches, points),
    };
  });
}

function compareCriterion(
  a: StandingsRow,
  b: StandingsRow,
  criterion: StandingsCriterionId,
  group: StandingsRow[],
  matches: StandingsMatchInput[],
  points: StandingsPoints
): number {
  switch (criterion) {
    case "winsLosses":
      return b.wins - a.wins || a.losses - b.losses;
    case "tournamentPoints":
      return b.tournamentPoints - a.tournamentPoints;
    case "setDifferential":
      return b.setDifferential - a.setDifferential;
    case "pointDifferential":
      return b.pointDifferential - a.pointDifferential;
    case "headToHead": {
      if (group.length < 2) return 0;
      const groupIds = new Set(group.map((r) => r.teamId));
      const mini = new Map<string, { pts: number; wins: number }>();
      for (const id of groupIds) mini.set(id, { pts: 0, wins: 0 });

      for (const m of matches) {
        if (m.status !== "COMPLETED") continue;
        if (!groupIds.has(m.teamAId) || !groupIds.has(m.teamBId)) continue;
        const aPts = matchTournamentPointsForTeam(m, m.teamAId, points);
        const bPts = matchTournamentPointsForTeam(m, m.teamBId, points);
        const aMini = mini.get(m.teamAId)!;
        const bMini = mini.get(m.teamBId)!;
        aMini.pts += aPts;
        bMini.pts += bPts;
        if (m.winnerTeamId === m.teamAId) aMini.wins += 1;
        else if (m.winnerTeamId === m.teamBId) bMini.wins += 1;
      }

      const aH = mini.get(a.teamId) ?? { pts: 0, wins: 0 };
      const bH = mini.get(b.teamId) ?? { pts: 0, wins: 0 };
      return bH.pts - aH.pts || bH.wins - aH.wins;
    }
    default:
      return 0;
  }
}

/**
 * Partition into tied groups under the comparison key built so far,
 * then sort within groups using the next criterion.
 */
function sortByCriteria(
  rows: StandingsRow[],
  criteria: StandingsCriterionId[],
  matches: StandingsMatchInput[],
  points: StandingsPoints
): StandingsRow[] {
  let groups: StandingsRow[][] = [rows];

  for (const criterion of criteria) {
    const nextGroups: StandingsRow[][] = [];
    for (const group of groups) {
      if (group.length <= 1) {
        nextGroups.push(group);
        continue;
      }
      const sorted = [...group].sort((a, b) =>
        compareCriterion(a, b, criterion, group, matches, points)
      );
      // Split into sub-groups that are still equal after this criterion
      let bucket: StandingsRow[] = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const cmp = compareCriterion(cur, prev, criterion, group, matches, points);
        if (cmp === 0) {
          bucket.push(cur);
        } else {
          nextGroups.push(bucket);
          bucket = [cur];
        }
      }
      nextGroups.push(bucket);
    }
    groups = nextGroups;
  }

  return groups.flat();
}

function applyManualOrder(rows: StandingsRow[], manualOrder: string[]): StandingsRow[] {
  const byId = new Map(rows.map((r) => [r.teamId, r]));
  const ordered: StandingsRow[] = [];
  const seen = new Set<string>();
  for (const id of manualOrder) {
    const row = byId.get(id);
    if (row && !seen.has(id)) {
      ordered.push(row);
      seen.add(id);
    }
  }
  for (const row of rows) {
    if (!seen.has(row.teamId)) ordered.push(row);
  }
  return ordered;
}

export type RankStandingsInput = {
  teams: StandingsTeamInput[];
  teamStats: StandingsTeamStatsInput[];
  matches: StandingsMatchInput[];
  config?: unknown;
};

/**
 * Rank teams for standings preview / public display.
 * When manualOrder is set, that order wins; otherwise sortCriteria apply.
 */
export function rankStandings(input: RankStandingsInput): StandingsRow[] {
  const config: StandingsConfig = resolveStandingsConfig(input.config);
  const rows = buildRows(input.teams, input.teamStats, input.matches, config.points);
  const autoRanked = sortByCriteria(rows, config.sortCriteria, input.matches, config.points);

  if (config.manualOrder && config.manualOrder.length > 0) {
    return applyManualOrder(autoRanked, config.manualOrder);
  }
  return autoRanked;
}
