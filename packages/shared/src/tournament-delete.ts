import type {
  BracketMatch,
  BracketSlotRef,
  PlayoffBracketDoc,
  PlayoffBracketStructure,
} from "./playoffs-config";

export type MatchDeleteInput = {
  status?: string;
  phase?: string;
  playSeq?: number;
  startedAt?: unknown;
  completedAt?: unknown;
  lastPlayAt?: unknown;
  winnerTeamId?: string | null;
};

export type MatchDeleteContext = {
  activeLockCount?: number;
  playCount?: number;
};

export type MatchDeleteOptions = {
  /**
   * When true, COMPLETED playoff matches may be deleted (full Delete Playoffs wipe).
   * Per-match admin delete keeps this false so completed playoffs cannot orphan feeders.
   */
  allowCompletedPlayoff?: boolean;
};

export type TeamDeleteInput = {
  inMatch?: boolean;
  inPlayoffBracket?: boolean;
};

export type PlayerDeleteInput = {
  teamInMatch?: boolean;
  inPlayLog?: boolean;
  matchesPlayed?: number;
};

export type DivisionDeleteInput = {
  matchDivisionRef?: boolean;
  teamInDivisionInMatch?: boolean;
};

function slotTeamId(ref: BracketSlotRef): string | null {
  return ref.type === "team" ? ref.teamId : null;
}

function collectFromMatch(m: BracketMatch, ids: Set<string>): void {
  const a = slotTeamId(m.teamA);
  const b = slotTeamId(m.teamB);
  if (a) ids.add(a);
  if (b) ids.add(b);
}

/** All teamIds referenced in saved playoff seeds + bracket structure. */
export function collectTeamIdsFromPlayoffBracket(
  bracket: PlayoffBracketDoc | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!bracket) return ids;
  for (const seed of bracket.seeds ?? []) {
    if (seed.teamId) ids.add(seed.teamId);
  }
  const structure = bracket.structure;
  if (!structure) return ids;
  for (const m of structure.playIns) collectFromMatch(m, ids);
  for (const round of structure.mainRounds) {
    for (const m of round.matches) collectFromMatch(m, ids);
  }
  for (const round of structure.lowerRounds) {
    for (const m of round.matches) collectFromMatch(m, ids);
  }
  for (const m of structure.finals) collectFromMatch(m, ids);
  return ids;
}

/**
 * Admin match delete:
 * - Pool (non-playoff): UPCOMING or COMPLETED
 * - Playoff per-match: UPCOMING only (COMPLETED blocked — feeders can cascade)
 * - Always block IN_PROGRESS and active tracker locks
 * Pass `allowCompletedPlayoff: true` for full Delete Playoffs clear.
 */
export function getMatchDeleteBlockers(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {},
  options: MatchDeleteOptions = {}
): string[] {
  const blockers: string[] = [];
  const status = String(match.status ?? "UPCOMING");
  const phase = String(match.phase ?? "");
  const isPlayoff = phase === "PLAYOFF";

  if (status === "IN_PROGRESS") {
    blockers.push("Match is in progress");
  } else if (status === "COMPLETED") {
    if (isPlayoff && !options.allowCompletedPlayoff) {
      blockers.push(
        "Completed playoff matches cannot be deleted individually — use Delete Playoffs to wipe the bracket"
      );
    }
  } else if (status !== "UPCOMING") {
    blockers.push(`Unsupported match status: ${status}`);
  }

  if ((ctx.activeLockCount ?? 0) > 0) {
    blockers.push("Active tracker lock — release locks first");
  }
  return blockers;
}

export function isMatchDeletable(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {},
  options: MatchDeleteOptions = {}
): boolean {
  return getMatchDeleteBlockers(match, ctx, options).length === 0;
}

/**
 * Admin match reset (wipe plays/stats, keep match shell): COMPLETED RR only.
 * Playoffs and non-completed statuses are blocked.
 */
export function getMatchResetBlockers(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {}
): string[] {
  const blockers: string[] = [];
  const status = String(match.status ?? "UPCOMING");
  const phase = String(match.phase ?? "");

  if (phase === "PLAYOFF") {
    blockers.push("Playoff matches cannot be reset — use Delete Playoffs for a full wipe");
  }
  if (status === "IN_PROGRESS") {
    blockers.push("Match is in progress — finish or release locks first");
  } else if (status === "UPCOMING") {
    blockers.push("Match has not been completed — nothing to reset");
  } else if (status !== "COMPLETED") {
    blockers.push(`Unsupported match status: ${status}`);
  }
  if ((ctx.activeLockCount ?? 0) > 0) {
    blockers.push("Active tracker lock — release locks first");
  }
  return blockers;
}

export function isMatchResettable(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {}
): boolean {
  return getMatchResetBlockers(match, ctx).length === 0;
}

/**
 * Schedule regenerate replaceability: only pristine upcoming matches (no
 * plays, progress, locks, or completion). Completed matches must not be wiped
 * by RR schedule generation.
 */
export function getMatchScheduleReplaceBlockers(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {}
): string[] {
  const blockers: string[] = [];
  const status = String(match.status ?? "UPCOMING");
  if (status !== "UPCOMING") {
    blockers.push(
      status === "IN_PROGRESS"
        ? "Match is in progress"
        : "Match is completed"
    );
  }
  if ((match.playSeq ?? 0) > 0) {
    blockers.push("Plays have been recorded");
  }
  if (match.startedAt) blockers.push("Match tracking has started");
  if (match.completedAt) blockers.push("Match has a completion time");
  if (match.lastPlayAt) blockers.push("Match has recent play activity");
  if (match.winnerTeamId) blockers.push("Match has a recorded winner");
  if ((ctx.activeLockCount ?? 0) > 0) {
    blockers.push("Active tracker lock — release locks first");
  }
  if ((ctx.playCount ?? 0) > 0) {
    blockers.push("Play log exists for this match");
  }
  return blockers;
}

export function isMatchReplaceableBySchedule(
  match: MatchDeleteInput,
  ctx: MatchDeleteContext = {}
): boolean {
  return getMatchScheduleReplaceBlockers(match, ctx).length === 0;
}

export function getTeamDeleteBlockers(input: TeamDeleteInput): string[] {
  const blockers: string[] = [];
  if (input.inMatch) blockers.push("Team is assigned to one or more matches");
  if (input.inPlayoffBracket) blockers.push("Team is referenced in the saved playoff bracket");
  return blockers;
}

export function isTeamDeletable(input: TeamDeleteInput): boolean {
  return getTeamDeleteBlockers(input).length === 0;
}

export function getPlayerDeleteBlockers(input: PlayerDeleteInput): string[] {
  const blockers: string[] = [];
  if (input.teamInMatch) {
    blockers.push("Player's team is assigned to one or more matches");
  }
  if (input.inPlayLog) blockers.push("Player appears in a match play log");
  if ((input.matchesPlayed ?? 0) > 0) {
    blockers.push("Player has recorded match participation in stats");
  }
  return blockers;
}

export function isPlayerDeletable(input: PlayerDeleteInput): boolean {
  return getPlayerDeleteBlockers(input).length === 0;
}

export function getDivisionDeleteBlockers(input: DivisionDeleteInput): string[] {
  const blockers: string[] = [];
  if (input.matchDivisionRef) {
    blockers.push("One or more matches reference this division");
  }
  if (input.teamInDivisionInMatch) {
    blockers.push("A team in this division is assigned to one or more matches");
  }
  return blockers;
}

export function isDivisionDeletable(input: DivisionDeleteInput): boolean {
  return getDivisionDeleteBlockers(input).length === 0;
}

/** Build sets used for client-side delete eligibility from loaded tournament data. */
export function buildMatchTeamIndex(
  matches: { teamAId?: string; teamBId?: string; divisionId?: string | null }[]
): {
  teamsInMatches: Set<string>;
  divisionsInMatches: Set<string>;
} {
  const teamsInMatches = new Set<string>();
  const divisionsInMatches = new Set<string>();
  for (const m of matches) {
    if (m.teamAId) teamsInMatches.add(m.teamAId);
    if (m.teamBId) teamsInMatches.add(m.teamBId);
    if (m.divisionId) divisionsInMatches.add(m.divisionId);
  }
  return { teamsInMatches, divisionsInMatches };
}

export type { PlayoffBracketStructure };
