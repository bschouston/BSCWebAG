import type {
  BracketMatch,
  BracketSlotRef,
  PlayoffBracketStructure,
  PlayoffSeed,
} from "./playoffs-config";
import { isSlotReady } from "./playoffs-schedule";

export type PlayoffMatchResultInput = {
  bracketMatchId: string;
  status?: string;
  winnerTeamId?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
};

export type PlayoffTeamMeta = {
  teamId: string;
  name: string;
  seed: number;
};

export type PlayoffMatchResult = {
  winnerTeamId: string;
  loserTeamId: string;
};

/** Completed playoff matches → winner/loser by bracketMatchId. */
export function buildPlayoffResultsMap(
  matches: PlayoffMatchResultInput[]
): Map<string, PlayoffMatchResult> {
  const map = new Map<string, PlayoffMatchResult>();
  for (const m of matches) {
    if (String(m.status ?? "") !== "COMPLETED") continue;
    const winnerTeamId = m.winnerTeamId ? String(m.winnerTeamId) : "";
    const teamAId = m.teamAId ? String(m.teamAId) : "";
    const teamBId = m.teamBId ? String(m.teamBId) : "";
    if (!winnerTeamId || !teamAId || !teamBId) continue;
    if (winnerTeamId !== teamAId && winnerTeamId !== teamBId) continue;
    const loserTeamId = winnerTeamId === teamAId ? teamBId : teamAId;
    map.set(String(m.bracketMatchId), { winnerTeamId, loserTeamId });
  }
  return map;
}

/** Seed list → teamId meta (name/seed) for materializing concrete team refs. */
export function buildPlayoffTeamMetaFromSeeds(
  seeds: PlayoffSeed[],
  nameByTeamId?: Map<string, string> | Record<string, string>
): Map<string, PlayoffTeamMeta> {
  const names =
    nameByTeamId instanceof Map
      ? nameByTeamId
      : new Map(Object.entries(nameByTeamId ?? {}));
  const map = new Map<string, PlayoffTeamMeta>();
  for (const s of seeds) {
    const teamId = String(s.teamId);
    map.set(teamId, {
      teamId,
      seed: s.seed,
      name: String(s.name ?? names.get(teamId) ?? teamId),
    });
  }
  return map;
}

function teamRef(meta: PlayoffTeamMeta): BracketSlotRef {
  return {
    type: "team",
    teamId: meta.teamId,
    seed: meta.seed,
    name: meta.name,
  };
}

function resolveSlotRef(
  ref: BracketSlotRef,
  results: Map<string, PlayoffMatchResult>,
  teamMeta: Map<string, PlayoffTeamMeta>
): BracketSlotRef {
  if (ref.type === "team" || ref.type === "tba") return ref;

  if (ref.type === "winner" || ref.type === "loser") {
    const result = results.get(ref.matchId);
    if (!result) return ref;
    const teamId = ref.type === "winner" ? result.winnerTeamId : result.loserTeamId;
    const meta = teamMeta.get(teamId);
    if (!meta) return ref;
    return teamRef(meta);
  }

  if (ref.type === "reseed") {
    // Deferred reseed applies after materialize via applyReseedIntentToStructure.
    // Never expand legacy `reseed` placeholders (esp. initial-seeds → fake L0 teams).
    return ref;
  }

  return ref;
}

function mapMatchSlots(
  match: BracketMatch,
  results: Map<string, PlayoffMatchResult>,
  teamMeta: Map<string, PlayoffTeamMeta>
): BracketMatch {
  return {
    id: match.id,
    teamA: resolveSlotRef(match.teamA, results, teamMeta),
    teamB: resolveSlotRef(match.teamB, results, teamMeta),
  };
}

/**
 * Overlay completed match results onto a bracket template.
 * Resolves winner/loser placeholders to concrete team refs when possible.
 * Does not mutate the input structure.
 */
export function materializePlayoffStructure(
  structure: PlayoffBracketStructure,
  results: Map<string, PlayoffMatchResult>,
  teamMeta: Map<string, PlayoffTeamMeta>
): PlayoffBracketStructure {
  if (results.size === 0) return structure;

  let current: PlayoffBracketStructure = {
    ...structure,
    playIns: structure.playIns.map((m) => ({ ...m, teamA: m.teamA, teamB: m.teamB })),
    mainRounds: structure.mainRounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => ({ ...m })),
    })),
    lowerRounds: structure.lowerRounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => ({ ...m })),
    })),
    finals: structure.finals.map((m) => ({ ...m })),
  };

  // Multi-pass: later rounds can depend on earlier winner/loser fills.
  for (let pass = 0; pass < 8; pass++) {
    const next: PlayoffBracketStructure = {
      ...current,
      playIns: current.playIns.map((m) => mapMatchSlots(m, results, teamMeta)),
      mainRounds: current.mainRounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => mapMatchSlots(m, results, teamMeta)),
      })),
      lowerRounds: current.lowerRounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => mapMatchSlots(m, results, teamMeta)),
      })),
      finals: current.finals.map((m) => mapMatchSlots(m, results, teamMeta)),
    };
    if (JSON.stringify(next) === JSON.stringify(current)) return next;
    current = next;
  }
  return current;
}

export type PlayoffChampionResolution = {
  teamId: string;
  bracketMatchId: string;
};

/**
 * Champion = winner of every final match (today: single F1M1).
 * Requires COMPLETED results with winnerTeamId for all structure.finals.
 */
export function resolvePlayoffChampion(
  structure: PlayoffBracketStructure,
  results: Map<string, PlayoffMatchResult>
): PlayoffChampionResolution | null {
  const finals = structure.finals ?? [];
  if (!finals.length) return null;

  let champion: PlayoffChampionResolution | null = null;
  for (const m of finals) {
    const result = results.get(m.id);
    if (!result?.winnerTeamId) return null;
    champion = { teamId: result.winnerTeamId, bracketMatchId: m.id };
  }
  return champion;
}

export type PlayoffPublishedMatchLike = {
  bracketMatchId: string;
  status?: string;
  winnerTeamId?: string | null;
};

/** True when every finals match is published, COMPLETED, and has a winner. */
export function isPlayoffBracketComplete(
  structure: PlayoffBracketStructure,
  publishedMatches: PlayoffPublishedMatchLike[]
): boolean {
  const finals = structure.finals ?? [];
  if (!finals.length) return false;
  const byId = new Map(
    publishedMatches.map((m) => [String(m.bracketMatchId), m])
  );
  for (const m of finals) {
    const pub = byId.get(m.id);
    if (!pub) return false;
    if (String(pub.status ?? "") !== "COMPLETED") return false;
    if (!pub.winnerTeamId) return false;
  }
  return true;
}

export type PlayoffReadySlotMatch = BracketMatch & { id: string };

/**
 * True when any bracket match has both teams concrete and is not yet published.
 */
export function hasUnpublishedReadySlots(
  structure: PlayoffBracketStructure,
  publishedBracketMatchIds: Set<string> | string[]
): boolean {
  const published =
    publishedBracketMatchIds instanceof Set
      ? publishedBracketMatchIds
      : new Set(publishedBracketMatchIds);

  const all: BracketMatch[] = [
    ...structure.playIns,
    ...structure.mainRounds.flatMap((r) => r.matches),
    ...structure.lowerRounds.flatMap((r) => r.matches),
    ...structure.finals,
  ];

  for (const m of all) {
    if (published.has(m.id)) continue;
    if (isSlotReady(m)) return true;
  }
  return false;
}
