import type {
  BracketLowerRound,
  BracketMainRound,
  BracketMatch,
  BracketSlotRef,
  PlayoffBracketStructure,
  PlayoffMergeSettings,
} from "./playoffs-config";
import {
  DEFAULT_MERGE_REMAINING_FRACTION,
  MIN_PLAYOFF_TEAMS,
} from "./playoffs-config";

export type PlayoffTeamInput = {
  teamId: string;
  name: string;
};

/** Classic 1…N seeding order (1 vs N, 2 vs N-1, …). */
export function generateSeedingOrder(n: number): number[] {
  if (n === 2) return [1, 2];
  const h = n / 2;
  const top = generateSeedingOrder(h);
  const out: number[] = [];
  for (const s of top) {
    out.push(s, n + 1 - s);
  }
  return out;
}

export function getDoubleElimBaseSize(teamCount: number): number {
  const lowerPower = Math.pow(2, Math.floor(Math.log2(teamCount)));
  return Math.max(4, lowerPower);
}

function clampFraction(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  return Math.max(minValue, Math.min(maxValue, value));
}

export function buildDoubleElimMergeSettings(
  totalTeams: number,
  remainingFraction: number,
  sourceLabel: string
): PlayoffMergeSettings {
  const safeTotalTeams = Math.max(1, Math.floor(totalTeams) || 1);
  const safeRemainingFraction = clampFraction(remainingFraction, 0.05, 0.95);
  const eliminatedFraction = 1 - safeRemainingFraction;
  const eliminationThreshold = Math.max(1, Math.ceil(safeTotalTeams * eliminatedFraction));
  const remainingTeamThreshold = Math.max(1, safeTotalTeams - eliminationThreshold);

  return {
    remainingFraction: safeRemainingFraction,
    eliminatedFraction,
    eliminationThreshold,
    remainingTeamThreshold,
    sourceLabel: sourceLabel || "Default",
  };
}

export function getDefaultDoubleElimMergeSettings(totalTeams: number): PlayoffMergeSettings {
  return buildDoubleElimMergeSettings(
    totalTeams,
    DEFAULT_MERGE_REMAINING_FRACTION,
    "Default: Double Elimination Merge Remaining Fraction"
  );
}

function teamRef(seed: number, team: PlayoffTeamInput): BracketSlotRef {
  return {
    type: "team",
    teamId: team.teamId,
    seed,
    name: team.name,
  };
}

function winnerRef(matchId: string): BracketSlotRef {
  return { type: "winner", matchId };
}

function loserRef(matchId: string): BracketSlotRef {
  return { type: "loser", matchId };
}

function isWinnerOf(ref: BracketSlotRef, matchId: string): boolean {
  return ref.type === "winner" && ref.matchId === matchId;
}

function computeDoubleElimPlayInResults(
  teams: PlayoffTeamInput[],
  baseSize: number
): { playIns: BracketMatch[]; seeds: BracketSlotRef[] } {
  const n = teams.length;
  const playInCount = Math.max(0, n - baseSize);
  const seeded = teams.map((t, i) => ({ seed: i + 1, team: t }));
  const playIns: BracketMatch[] = [];

  for (let i = 0; i < playInCount; i++) {
    const a = seeded[baseSize - playInCount + i];
    const b = seeded[seeded.length - 1 - i];
    playIns.push({
      id: `P${i + 1}`,
      teamA: teamRef(a.seed, a.team),
      teamB: teamRef(b.seed, b.team),
    });
  }

  const seeds: BracketSlotRef[] = [];
  for (let i = 0; i < baseSize - playInCount; i++) {
    const s = seeded[i];
    seeds.push(teamRef(s.seed, s.team));
  }
  for (let i = 0; i < playInCount; i++) {
    seeds.push(winnerRef(`P${i + 1}`));
  }

  return { playIns, seeds };
}

function buildDoubleElimWinnersBracket(
  seeds: BracketSlotRef[],
  baseSize: number,
  roundsInWinners: number
): Record<number, BracketMatch[]> {
  const winners: Record<number, BracketMatch[]> = {};
  const order = generateSeedingOrder(baseSize);
  winners[1] = [];

  for (let i = 0; i < order.length; i += 2) {
    winners[1].push({
      id: `R1M${i / 2 + 1}`,
      teamA: seeds[order[i] - 1],
      teamB: seeds[order[i + 1] - 1],
    });
  }

  for (let r = 2; r <= roundsInWinners; r++) {
    winners[r] = [];
    for (let i = 0; i < winners[r - 1].length; i += 2) {
      const a = winners[r - 1][i];
      const b = winners[r - 1][i + 1];
      winners[r].push({
        id: `R${r}M${i / 2 + 1}`,
        teamA: winnerRef(a.id),
        teamB: winnerRef(b.id),
      });
    }
  }

  return winners;
}

function getPlayInFeedMap(
  playIns: BracketMatch[],
  r1Matches: BracketMatch[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const playIn of playIns) {
    const fedMatch = r1Matches.find(
      (match) => isWinnerOf(match.teamA, playIn.id) || isWinnerOf(match.teamB, playIn.id)
    );
    if (fedMatch) map[playIn.id] = fedMatch.id;
  }
  return map;
}

function interleaveWinnerAndLowerRefs(
  winnerRefs: BracketSlotRef[],
  lowerRefs: BracketSlotRef[]
): BracketSlotRef[] {
  const refs: BracketSlotRef[] = [];
  const pairCount = Math.min(winnerRefs.length, lowerRefs.length);

  for (let i = 0; i < pairCount; i++) {
    refs.push(winnerRefs[i], lowerRefs[i]);
  }

  return refs.concat(winnerRefs.slice(pairCount)).concat(lowerRefs.slice(pairCount));
}

/**
 * Hybrid double-elimination: true DE until ~1/3 eliminated (configurable),
 * then merge lower into winners and finish as single elimination.
 * Ported from ScheduleMaker.js `buildHybridDoubleElimStructure`.
 */
export function buildHybridDoubleElimStructure(
  teams: PlayoffTeamInput[],
  mergeSettings?: PlayoffMergeSettings
): PlayoffBracketStructure {
  if (teams.length < MIN_PLAYOFF_TEAMS) {
    throw new Error(`Double Elimination requires at least ${MIN_PLAYOFF_TEAMS} playoff teams.`);
  }

  const totalTeams = teams.length;
  const baseSize = getDoubleElimBaseSize(totalTeams);
  const roundsInWinners = Math.log2(baseSize);
  const resolvedMergeSettings =
    mergeSettings ?? getDefaultDoubleElimMergeSettings(totalTeams);
  const eliminationThreshold = resolvedMergeSettings.eliminationThreshold;

  const { playIns, seeds } = computeDoubleElimPlayInResults(teams, baseSize);
  const standardWinners = buildDoubleElimWinnersBracket(seeds, baseSize, roundsInWinners);
  const lowerRounds: BracketLowerRound[] = [];
  let lowerRoundNumber = 0;
  let eliminatedCount = 0;

  function createLowerRound(pairs: [BracketSlotRef, BracketSlotRef][]): BracketSlotRef[] {
    if (!pairs.length) return [];

    const label = `L${lowerRoundNumber}`;
    const matches: BracketMatch[] = pairs.map((pair, idx) => ({
      id: `${label}M${idx + 1}`,
      teamA: pair[0],
      teamB: pair[1],
    }));

    lowerRounds.push({ label, matches });
    lowerRoundNumber++;
    eliminatedCount += matches.length;

    return matches.map((match) => winnerRef(match.id));
  }

  function condenseRefsToTarget(
    refs: BracketSlotRef[],
    targetCount: number
  ): BracketSlotRef[] {
    const safeTarget = Math.max(1, targetCount || 1);
    let activeRefs = refs.slice();

    while (activeRefs.length > safeTarget) {
      const pairs: [BracketSlotRef, BracketSlotRef][] = [];
      const carry: BracketSlotRef[] = [];
      for (let i = 0; i < activeRefs.length; i += 2) {
        if (i + 1 < activeRefs.length) {
          pairs.push([activeRefs[i], activeRefs[i + 1]]);
        } else {
          carry.push(activeRefs[i]);
        }
      }
      activeRefs = createLowerRound(pairs).concat(carry);
    }

    return activeRefs;
  }

  function pairSourcesToTarget(
    dropRefs: BracketSlotRef[],
    lowerRefsIn: BracketSlotRef[],
    targetCount: number
  ): BracketSlotRef[] {
    let refs: BracketSlotRef[];
    const safeTarget = Math.max(1, targetCount || 1);

    if (dropRefs.length && lowerRefsIn.length) {
      const pairCount = Math.min(dropRefs.length, lowerRefsIn.length);
      const pairs: [BracketSlotRef, BracketSlotRef][] = [];
      for (let i = 0; i < pairCount; i++) {
        pairs.push([dropRefs[i], lowerRefsIn[i]]);
      }
      refs = createLowerRound(pairs)
        .concat(dropRefs.slice(pairCount))
        .concat(lowerRefsIn.slice(pairCount));
    } else {
      refs = dropRefs.concat(lowerRefsIn);
    }

    return condenseRefsToTarget(refs, safeTarget);
  }

  const r1Matches = standardWinners[1] || [];
  const playInFeedMap = getPlayInFeedMap(playIns, r1Matches);
  const usedR1Drops: Record<string, boolean> = {};
  let lowerRefs: BracketSlotRef[] = [];

  if (playIns.length) {
    const playInPairs: [BracketSlotRef, BracketSlotRef][] = [];
    for (const playIn of playIns) {
      const fedMatchId = playInFeedMap[playIn.id];
      if (!fedMatchId) continue;
      playInPairs.push([loserRef(playIn.id), loserRef(fedMatchId)]);
      usedR1Drops[fedMatchId] = true;
    }
    lowerRefs = createLowerRound(playInPairs);
  }

  const remainingR1Drops = r1Matches
    .filter((match) => !usedR1Drops[match.id])
    .map((match) => loserRef(match.id));
  const firstWinnersTarget = standardWinners[2] ? standardWinners[2].length : 1;
  lowerRefs = pairSourcesToTarget(remainingR1Drops, lowerRefs, firstWinnersTarget);

  let mergeAfterWinnersRound: number | null = null;
  if (eliminatedCount >= eliminationThreshold) {
    mergeAfterWinnersRound = Math.min(2, roundsInWinners);
  }

  for (let r = 2; r <= roundsInWinners && !mergeAfterWinnersRound; r++) {
    const winnersRoundDrops = (standardWinners[r] || []).map((match) => loserRef(match.id));
    const targetAfterDrops = winnersRoundDrops.length || 1;
    lowerRefs = pairSourcesToTarget(winnersRoundDrops, lowerRefs, targetAfterDrops);

    if (eliminatedCount >= eliminationThreshold || r === roundsInWinners) {
      mergeAfterWinnersRound = r;
      break;
    }

    const nextTarget = standardWinners[r + 1] ? standardWinners[r + 1].length : 1;
    lowerRefs = pairSourcesToTarget([], lowerRefs, nextTarget);

    if (eliminatedCount >= eliminationThreshold) {
      mergeAfterWinnersRound = Math.min(r + 1, roundsInWinners);
      break;
    }
  }

  if (!mergeAfterWinnersRound) mergeAfterWinnersRound = roundsInWinners;

  const mainRounds: BracketMainRound[] = [];
  for (let r = 1; r <= mergeAfterWinnersRound; r++) {
    mainRounds.push({
      roundNumber: r,
      title: `Winners R${r}`,
      matches: standardWinners[r] || [],
    });
  }

  const winnersRefsAtMerge = (standardWinners[mergeAfterWinnersRound] || []).map((match) =>
    winnerRef(match.id)
  );

  lowerRefs = condenseRefsToTarget(lowerRefs, winnersRefsAtMerge.length || 1);

  let liveRefs = interleaveWinnerAndLowerRefs(winnersRefsAtMerge, lowerRefs);
  let nextRoundNumber = mergeAfterWinnersRound + 1;

  while (liveRefs.length > 2) {
    const matches: BracketMatch[] = [];
    const nextRefs: BracketSlotRef[] = [];

    for (let i = 0; i < liveRefs.length; i += 2) {
      if (i + 1 < liveRefs.length) {
        const id = `R${nextRoundNumber}M${matches.length + 1}`;
        matches.push({
          id,
          teamA: liveRefs[i],
          teamB: liveRefs[i + 1],
        });
        nextRefs.push(winnerRef(id));
      } else {
        nextRefs.push(liveRefs[i]);
      }
    }

    if (matches.length) {
      mainRounds.push({
        roundNumber: nextRoundNumber,
        title: `Winners R${nextRoundNumber}`,
        matches,
      });
    }

    liveRefs = nextRefs;
    nextRoundNumber++;
  }

  const finals: BracketMatch[] =
    liveRefs.length === 2
      ? [{ id: "F1M1", teamA: liveRefs[0], teamB: liveRefs[1] }]
      : [{ id: "F1M1", teamA: liveRefs[0] ?? { type: "tba" }, teamB: { type: "tba" } }];

  return {
    playIns,
    mainRounds,
    lowerRounds,
    finals,
    eliminatedBeforeMerge: eliminatedCount,
    eliminationThreshold,
    remainingTeamThreshold: resolvedMergeSettings.remainingTeamThreshold,
    mergeSettings: resolvedMergeSettings,
    mergeAfterWinnersRound,
  };
}

export type GenerateDoubleElimInput = {
  teams: PlayoffTeamInput[];
  mergeRemainingFraction?: number;
};

/** Build a double-elim bracket from an ordered seed list (index 0 = seed 1). */
export function generateDoubleEliminationBracket(
  input: GenerateDoubleElimInput
): PlayoffBracketStructure {
  const mergeSettings = buildDoubleElimMergeSettings(
    input.teams.length,
    input.mergeRemainingFraction ?? DEFAULT_MERGE_REMAINING_FRACTION,
    "Playoff config: mergeRemainingFraction"
  );
  return buildHybridDoubleElimStructure(input.teams, mergeSettings);
}
