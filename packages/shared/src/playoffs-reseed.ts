import type {
  BracketMatch,
  BracketSlotRef,
  PlayoffBracketStructure,
} from "./playoffs-config";

export type ReseedableRoundRail = "winners" | "losers" | "final";

export type ReseedableRound = {
  key: string;
  label: string;
  rail: ReseedableRoundRail;
  /** True when this is the last winners main round before Final (semifinals). */
  isSemifinal: boolean;
};

export function winnersRoundKey(roundNumber: number): string {
  return `winners-r${roundNumber}`;
}

export function losersRoundKey(label: string): string {
  return `losers-${label}`;
}

export const PLAY_INS_ROUND_KEY = "play-ins";
export const FINAL_ROUND_KEY = "final";
export const INITIAL_SEEDS_ROUND_KEY = "initial-seeds";

/** List all rounds that can opt into reseeding. */
export function listReseedableRounds(structure: PlayoffBracketStructure): ReseedableRound[] {
  const rounds: ReseedableRound[] = [];
  if (structure.playIns.length) {
    rounds.push({
      key: PLAY_INS_ROUND_KEY,
      label: "Play-ins",
      rail: "winners",
      isSemifinal: false,
    });
  }
  const lastWinnersIdx = structure.mainRounds.length - 1;
  structure.mainRounds.forEach((round, idx) => {
    rounds.push({
      key: winnersRoundKey(round.roundNumber),
      label: round.title,
      rail: "winners",
      isSemifinal: idx === lastWinnersIdx && structure.finals.length > 0,
    });
  });
  if (structure.finals.length) {
    rounds.push({
      key: FINAL_ROUND_KEY,
      label: "Final",
      rail: "final",
      isSemifinal: false,
    });
  }
  for (const round of structure.lowerRounds) {
    rounds.push({
      key: losersRoundKey(round.label),
      label: `Losers ${round.label}`,
      rail: "losers",
      isSemifinal: false,
    });
  }
  return rounds;
}

/**
 * Default checked rounds when enabling reseeding:
 * winners rounds after the first main round, excluding semifinals / play-ins / final / losers.
 */
export function defaultReseedRoundKeys(structure: PlayoffBracketStructure): string[] {
  const winnersMain = listReseedableRounds(structure).filter(
    (r) => r.rail === "winners" && r.key !== PLAY_INS_ROUND_KEY
  );
  return winnersMain.filter((r, index) => index > 0 && !r.isSemifinal).map((r) => r.key);
}

export function getMatchesForRoundKey(
  structure: PlayoffBracketStructure,
  roundKey: string
): BracketMatch[] {
  if (roundKey === PLAY_INS_ROUND_KEY) return structure.playIns;
  if (roundKey === FINAL_ROUND_KEY) return structure.finals;
  if (roundKey === INITIAL_SEEDS_ROUND_KEY) return [];
  if (roundKey.startsWith("winners-r")) {
    const n = Number(roundKey.slice("winners-r".length));
    return structure.mainRounds.find((r) => r.roundNumber === n)?.matches ?? [];
  }
  if (roundKey.startsWith("losers-")) {
    const label = roundKey.slice("losers-".length);
    return structure.lowerRounds.find((r) => r.label === label)?.matches ?? [];
  }
  return [];
}

export function findRoundKeyForMatchId(
  structure: PlayoffBracketStructure,
  matchId: string
): string | null {
  if (structure.playIns.some((m) => m.id === matchId)) return PLAY_INS_ROUND_KEY;
  for (const round of structure.mainRounds) {
    if (round.matches.some((m) => m.id === matchId)) return winnersRoundKey(round.roundNumber);
  }
  if (structure.finals.some((m) => m.id === matchId)) return FINAL_ROUND_KEY;
  for (const round of structure.lowerRounds) {
    if (round.matches.some((m) => m.id === matchId)) return losersRoundKey(round.label);
  }
  return null;
}

function priorWinnersRoundKey(
  structure: PlayoffBracketStructure,
  roundKey: string
): string {
  if (roundKey === PLAY_INS_ROUND_KEY) return INITIAL_SEEDS_ROUND_KEY;
  if (roundKey === FINAL_ROUND_KEY) {
    const last = structure.mainRounds[structure.mainRounds.length - 1];
    if (last) return winnersRoundKey(last.roundNumber);
    if (structure.playIns.length) return PLAY_INS_ROUND_KEY;
    return INITIAL_SEEDS_ROUND_KEY;
  }
  if (roundKey.startsWith("winners-r")) {
    const n = Number(roundKey.slice("winners-r".length));
    const idx = structure.mainRounds.findIndex((r) => r.roundNumber === n);
    if (idx <= 0) {
      return structure.playIns.length ? PLAY_INS_ROUND_KEY : INITIAL_SEEDS_ROUND_KEY;
    }
    return winnersRoundKey(structure.mainRounds[idx - 1].roundNumber);
  }
  return INITIAL_SEEDS_ROUND_KEY;
}

function priorLosersRoundKey(
  structure: PlayoffBracketStructure,
  roundKey: string
): string {
  if (!roundKey.startsWith("losers-")) return INITIAL_SEEDS_ROUND_KEY;
  const label = roundKey.slice("losers-".length);
  const idx = structure.lowerRounds.findIndex((r) => r.label === label);
  if (idx <= 0) return INITIAL_SEEDS_ROUND_KEY;
  return losersRoundKey(structure.lowerRounds[idx - 1].label);
}

function reseedRef(rank: number, fromRoundKey: string, poolSize: number): BracketSlotRef {
  return { type: "reseed", rank, fromRoundKey, poolSize };
}

/** Pair poolSize teams as 1 vs N, 2 vs N-1, … keeping existing match ids. */
function reseedMatches(
  matches: BracketMatch[],
  fromRoundKey: string
): BracketMatch[] {
  const poolSize = matches.length * 2;
  return matches.map((match, i) => {
    const high = i + 1;
    const low = poolSize - i;
    return {
      id: match.id,
      teamA: reseedRef(high, fromRoundKey, poolSize),
      teamB: reseedRef(low, fromRoundKey, poolSize),
    };
  });
}

/**
 * Rewrite checked rounds to high-vs-low seed placeholders.
 * Unchecked rounds keep fixed Winner/Loser feeder refs.
 */
export function applyBracketReseed(
  structure: PlayoffBracketStructure,
  reseedRoundKeys: string[]
): PlayoffBracketStructure {
  const keys = new Set(reseedRoundKeys);
  if (keys.size === 0) return structure;

  const next: PlayoffBracketStructure = {
    ...structure,
    playIns: structure.playIns.map((m) => ({ ...m })),
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

  if (keys.has(PLAY_INS_ROUND_KEY) && next.playIns.length) {
    next.playIns = reseedMatches(next.playIns, priorWinnersRoundKey(next, PLAY_INS_ROUND_KEY));
  }

  for (let i = 0; i < next.mainRounds.length; i++) {
    const round = next.mainRounds[i];
    const key = winnersRoundKey(round.roundNumber);
    if (!keys.has(key) || !round.matches.length) continue;
    next.mainRounds[i] = {
      ...round,
      matches: reseedMatches(round.matches, priorWinnersRoundKey(next, key)),
    };
  }

  if (keys.has(FINAL_ROUND_KEY) && next.finals.length) {
    next.finals = reseedMatches(next.finals, priorWinnersRoundKey(next, FINAL_ROUND_KEY));
  }

  for (let i = 0; i < next.lowerRounds.length; i++) {
    const round = next.lowerRounds[i];
    const key = losersRoundKey(round.label);
    if (!keys.has(key) || !round.matches.length) continue;
    next.lowerRounds[i] = {
      ...round,
      matches: reseedMatches(round.matches, priorLosersRoundKey(next, key)),
    };
  }

  return next;
}

/** Build base bracket then optionally apply reseeding. */
export function buildPlayoffStructureWithReseed(
  structure: PlayoffBracketStructure,
  reseedEnabled: boolean,
  reseedRoundKeys: string[]
): PlayoffBracketStructure {
  if (!reseedEnabled || reseedRoundKeys.length === 0) return structure;
  return applyBracketReseed(structure, reseedRoundKeys);
}
