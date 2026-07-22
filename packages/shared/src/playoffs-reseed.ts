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

function isTeamRef(ref: BracketSlotRef): ref is Extract<BracketSlotRef, { type: "team" }> {
  return ref.type === "team";
}

/** True when every slot in the round is a concrete team. */
export function isRoundConcrete(matches: BracketMatch[]): boolean {
  return (
    matches.length > 0 && matches.every((m) => isTeamRef(m.teamA) && isTeamRef(m.teamB))
  );
}

/** List all rounds that can opt into reseeding (intent keys). */
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
 * Default intent keys when enabling reseeding historically:
 * winners rounds after the first main round, excluding semifinals / play-ins / final / losers.
 * Intent only — does not rewrite the feeder template.
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

function cloneStructure(structure: PlayoffBracketStructure): PlayoffBracketStructure {
  return {
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
}

/**
 * Pair concrete teams in a round as best seed vs worst (1 vs N, 2 vs N-1, …),
 * keeping existing match ids. No-op if the round is not fully concrete.
 */
export function reshuffleRoundBySeed(matches: BracketMatch[]): BracketMatch[] {
  if (!isRoundConcrete(matches)) return matches;

  const byId = new Map<string, Extract<BracketSlotRef, { type: "team" }>>();
  for (const m of matches) {
    if (m.teamA.type === "team") byId.set(m.teamA.teamId, m.teamA);
    if (m.teamB.type === "team") byId.set(m.teamB.teamId, m.teamB);
  }
  const sorted = [...byId.values()].sort((a, b) => a.seed - b.seed);
  const expected = matches.length * 2;
  if (sorted.length !== expected) return matches;

  return matches.map((match, i) => ({
    id: match.id,
    teamA: sorted[i],
    teamB: sorted[sorted.length - 1 - i],
  }));
}

function setMatchesForRoundKey(
  structure: PlayoffBracketStructure,
  roundKey: string,
  matches: BracketMatch[]
): void {
  if (roundKey === PLAY_INS_ROUND_KEY) {
    structure.playIns = matches;
    return;
  }
  if (roundKey === FINAL_ROUND_KEY) {
    structure.finals = matches;
    return;
  }
  if (roundKey.startsWith("winners-r")) {
    const n = Number(roundKey.slice("winners-r".length));
    const idx = structure.mainRounds.findIndex((r) => r.roundNumber === n);
    if (idx >= 0) {
      structure.mainRounds[idx] = { ...structure.mainRounds[idx], matches };
    }
    return;
  }
  if (roundKey.startsWith("losers-")) {
    const label = roundKey.slice("losers-".length);
    const idx = structure.lowerRounds.findIndex((r) => r.label === label);
    if (idx >= 0) {
      structure.lowerRounds[idx] = { ...structure.lowerRounds[idx], matches };
    }
  }
}

/**
 * Apply reseed intent to a (typically materialized) structure: for each keyed round
 * that is fully concrete, reshuffle by seed. Non-concrete rounds are left alone
 * (feeder placeholders stay intact).
 */
export function applyReseedIntentToStructure(
  structure: PlayoffBracketStructure,
  reseedRoundKeys: string[]
): PlayoffBracketStructure {
  const keys = [...new Set(reseedRoundKeys)].filter(Boolean);
  if (keys.length === 0) return structure;

  const next = cloneStructure(structure);
  for (const key of keys) {
    const matches = getMatchesForRoundKey(next, key);
    if (!isRoundConcrete(matches)) continue;
    setMatchesForRoundKey(next, key, reshuffleRoundBySeed(matches));
  }
  return next;
}

/**
 * @deprecated Early template rewrite removed — feeder graph stays intact.
 * Prefer applyReseedIntentToStructure on a materialized structure.
 */
export function applyBracketReseed(
  structure: PlayoffBracketStructure,
  _reseedRoundKeys: string[]
): PlayoffBracketStructure {
  return structure;
}

/**
 * Returns the base feeder structure unchanged. Reseed is deferred via
 * applyReseedIntentToStructure after teams are concrete.
 */
export function buildPlayoffStructureWithReseed(
  structure: PlayoffBracketStructure,
  _reseedEnabled: boolean,
  _reseedRoundKeys: string[]
): PlayoffBracketStructure {
  return structure;
}
