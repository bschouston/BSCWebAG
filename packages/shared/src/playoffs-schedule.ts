import type { BracketMatch, BracketSlotRef, PlayoffBracketStructure, PlayoffConfig } from "./playoffs-config";
import {
  FINAL_ROUND_KEY,
  PLAY_INS_ROUND_KEY,
  findRoundKeyForMatchId,
  getMatchesForRoundKey,
  losersRoundKey,
  winnersRoundKey,
} from "./playoffs-reseed";
import { DEFAULT_TOURNAMENT_TIMEZONE, wallDateTimeToUtcDate } from "./datetime-timezone";

export type PlayoffSlot = {
  bracketMatchId: string;
  roundKey: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  dependsOn: string[];
};

export type ScheduledPlayoffBlock = {
  bracketMatchId: string;
  courtNumber: number;
  scheduledAt: string; // ISO
  endAt: string; // ISO
  teamAId: string;
  teamBId: string;
};

export type PlayoffScheduleAssignment = {
  bracketMatchId: string;
  courtNumber: number;
  scheduledAt: string;
  teamAId: string;
  teamBId: string;
  dependsOnBracketMatchIds: string[];
};

function depsFromRef(ref: BracketSlotRef): string[] {
  if (ref.type === "winner" || ref.type === "loser") return [ref.matchId];
  return [];
}

export function isConcreteTeamRef(ref: BracketSlotRef): ref is Extract<BracketSlotRef, { type: "team" }> {
  return ref.type === "team";
}

export function isSlotReady(match: BracketMatch): boolean {
  return isConcreteTeamRef(match.teamA) && isConcreteTeamRef(match.teamB);
}

export function flattenPlayoffSlots(structure: PlayoffBracketStructure): PlayoffSlot[] {
  const all: BracketMatch[] = [
    ...structure.playIns,
    ...structure.mainRounds.flatMap((r) => r.matches),
    ...structure.lowerRounds.flatMap((r) => r.matches),
    ...structure.finals,
  ];

  const slots: PlayoffSlot[] = [];
  for (const m of all) {
    if (!isConcreteTeamRef(m.teamA) || !isConcreteTeamRef(m.teamB)) continue;
    const roundKey = findRoundKeyForMatchId(structure, m.id) ?? "unknown";
    slots.push({
      bracketMatchId: m.id,
      roundKey,
      teamAId: m.teamA.teamId,
      teamBId: m.teamB.teamId,
      teamAName: m.teamA.name,
      teamBName: m.teamB.name,
      dependsOn: [...depsFromRef(m.teamA), ...depsFromRef(m.teamB)],
    });
  }
  return slots;
}

export function listAllBracketMatches(structure: PlayoffBracketStructure): BracketMatch[] {
  return [
    ...structure.playIns,
    ...structure.mainRounds.flatMap((r) => r.matches),
    ...structure.lowerRounds.flatMap((r) => r.matches),
    ...structure.finals,
  ];
}

export function isRoundFullyPopulated(
  structure: PlayoffBracketStructure,
  roundKey: string
): boolean {
  const matches = getMatchesForRoundKey(structure, roundKey);
  return matches.length > 0 && matches.every(isSlotReady);
}

function parseLocalDateTime(scheduleDate: string, startTime: string): Date {
  return wallDateTimeToUtcDate(scheduleDate, startTime, DEFAULT_TOURNAMENT_TIMEZONE);
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function sortSlotsByDependencies(slots: PlayoffSlot[]): PlayoffSlot[] {
  const byId = new Map(slots.map((s) => [s.bracketMatchId, s]));
  const selected = new Set(slots.map((s) => s.bracketMatchId));
  const ordered: PlayoffSlot[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();

  function visit(id: string) {
    if (done.has(id) || !selected.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    const slot = byId.get(id);
    if (slot) {
      for (const dep of slot.dependsOn) {
        if (selected.has(dep)) visit(dep);
      }
      ordered.push(slot);
    }
    done.add(id);
    visiting.delete(id);
  }

  for (const s of slots) visit(s.bracketMatchId);
  return ordered;
}

function endOfBlock(block: { scheduledAt: string; endAt?: string }, durationMs: number): Date {
  if (block.endAt) return new Date(block.endAt);
  return new Date(new Date(block.scheduledAt).getTime() + durationMs);
}

/**
 * Batch-schedule ready playoff slots against existing published blocks.
 *
 * Each Generate Next call starts at the next timeslot after the latest existing
 * playoff match (max scheduledAt + duration), and does not backfill earlier
 * free courts. Within one call, packs concurrent matches across courts, then
 * advances timeslots until all selected slots are placed.
 */
export function scheduleReadyPlayoffMatches(input: {
  slots: PlayoffSlot[];
  existingBlocks: ScheduledPlayoffBlock[];
  scheduleDate: string;
  startTime: string;
  matchDurationMinutes: number;
  numberOfCourts: number;
}): PlayoffScheduleAssignment[] {
  const durationMs = input.matchDurationMinutes * 60_000;
  const playoffStart = parseLocalDateTime(input.scheduleDate, input.startTime);
  const ordered = sortSlotsByDependencies(input.slots);

  type Block = {
    bracketMatchId: string;
    court: number;
    start: Date;
    end: Date;
    teams: Set<string>;
  };

  const blocks: Block[] = input.existingBlocks.map((b) => ({
    bracketMatchId: b.bracketMatchId,
    court: b.courtNumber,
    start: new Date(b.scheduledAt),
    end: endOfBlock(b, durationMs),
    teams: new Set([b.teamAId, b.teamBId].filter(Boolean)),
  }));

  let generationStart = new Date(playoffStart);
  if (blocks.length) {
    let latestStartMs = Number.NEGATIVE_INFINITY;
    for (const b of blocks) {
      const t = b.start.getTime();
      if (t > latestStartMs) latestStartMs = t;
    }
    generationStart = new Date(latestStartMs + durationMs);
  }

  const scheduledById = new Map(blocks.map((b) => [b.bracketMatchId, b]));
  const assignments: PlayoffScheduleAssignment[] = [];
  const pending = ordered.map((s) => ({ ...s }));

  let guard = 0;
  while (pending.length && guard++ < 5000) {
    const readyRows = pending.filter((row) => {
      let readyAfter = new Date(playoffStart);
      for (const depId of row.dependsOn) {
        const dep =
          scheduledById.get(depId) ??
          blocks.find((b) => b.bracketMatchId === depId);
        if (!dep) {
          // Dep not in this batch or published yet — allow from playoff start
          // (structure deps may point at unpublished parents; still schedule if both teams known)
          continue;
        }
        if (dep.end > readyAfter) readyAfter = new Date(dep.end);
      }
      (row as PlayoffSlot & { readyAfter?: Date }).readyAfter = readyAfter;
      return true;
    });

    const slot = findNextPlayableSlot(
      readyRows as (PlayoffSlot & { readyAfter: Date })[],
      blocks,
      input.numberOfCourts,
      generationStart,
      durationMs
    );
    if (!slot) break;

    const selected = selectBestBatch(slot.candidates, slot.freeCourts.length);
    if (!selected.length) break;

    selected.forEach((row, idx) => {
      const court = slot.freeCourts[idx];
      const start = new Date(slot.time);
      const end = new Date(start.getTime() + durationMs);
      const block: Block = {
        bracketMatchId: row.bracketMatchId,
        court,
        start,
        end,
        teams: new Set([row.teamAId, row.teamBId]),
      };
      blocks.push(block);
      scheduledById.set(row.bracketMatchId, block);
      assignments.push({
        bracketMatchId: row.bracketMatchId,
        courtNumber: court,
        scheduledAt: start.toISOString(),
        teamAId: row.teamAId,
        teamBId: row.teamBId,
        dependsOnBracketMatchIds: row.dependsOn,
      });
      const removeIdx = pending.findIndex((p) => p.bracketMatchId === row.bracketMatchId);
      if (removeIdx >= 0) pending.splice(removeIdx, 1);
    });
  }

  return assignments;
}

function findNextPlayableSlot(
  rows: (PlayoffSlot & { readyAfter: Date })[],
  blocks: { court: number; start: Date; end: Date; teams: Set<string> }[],
  nCourts: number,
  searchStart: Date,
  durationMs: number
): { time: Date; freeCourts: number[]; candidates: (PlayoffSlot & { readyAfter: Date })[] } | null {
  let slotTime = new Date(searchStart);
  for (let i = 0; i < 2000; i++) {
    const slotEnd = new Date(slotTime.getTime() + durationMs);
    const freeCourts: number[] = [];
    for (let court = 1; court <= nCourts; court++) {
      const occupied = blocks.some(
        (b) => b.court === court && intervalsOverlap(slotTime, slotEnd, b.start, b.end)
      );
      if (!occupied) freeCourts.push(court);
    }
    if (freeCourts.length) {
      const busyTeams = new Set<string>();
      for (const b of blocks) {
        if (intervalsOverlap(slotTime, slotEnd, b.start, b.end)) {
          for (const t of b.teams) busyTeams.add(t);
        }
      }
      const candidates = rows.filter((row) => {
        if (!row.teamAId || !row.teamBId || row.teamAId === row.teamBId) return false;
        if (row.readyAfter && slotTime < row.readyAfter) return false;
        return !busyTeams.has(row.teamAId) && !busyTeams.has(row.teamBId);
      });
      if (candidates.length) {
        return { time: new Date(slotTime), freeCourts, candidates };
      }
    }
    slotTime = new Date(slotTime.getTime() + durationMs);
  }
  return null;
}

function selectBestBatch<T extends PlayoffSlot>(candidates: T[], maxMatches: number): T[] {
  const selected: T[] = [];
  const usedTeams = new Set<string>();
  for (const c of candidates) {
    if (selected.length >= maxMatches) break;
    if (usedTeams.has(c.teamAId) || usedTeams.has(c.teamBId)) continue;
    selected.push(c);
    usedTeams.add(c.teamAId);
    usedTeams.add(c.teamBId);
  }
  return selected;
}

export function resolveScheduleConfig(config: PlayoffConfig): {
  scheduleDate: string;
  startTime: string;
  matchDurationMinutes: number;
  numberOfCourts: number;
} {
  return {
    scheduleDate: config.scheduleDate ?? new Date().toISOString().slice(0, 10),
    startTime: config.startTime ?? "09:00",
    matchDurationMinutes: config.matchDurationMinutes ?? 30,
    numberOfCourts: config.numberOfCourts ?? 2,
  };
}

/** Expand round keys to bracket match ids from structure. */
export function expandRoundKeysToMatchIds(
  structure: PlayoffBracketStructure,
  roundKeys: string[]
): string[] {
  const ids: string[] = [];
  for (const key of roundKeys) {
    for (const m of getMatchesForRoundKey(structure, key)) {
      ids.push(m.id);
    }
  }
  return [...new Set(ids)];
}

export function roundKeyForStructureMatch(
  structure: PlayoffBracketStructure,
  matchId: string
): string | null {
  return findRoundKeyForMatchId(structure, matchId);
}

export type PlayoffMatchDestinations = {
  /** Destination match ids that receive the winner of `bracketMatchId`. */
  winnerTo: string[];
  /** Destination match ids that receive the loser of `bracketMatchId`. */
  loserTo: string[];
  /** True when no slot references the loser (eliminated from the bracket). */
  loserEliminated: boolean;
};

/**
 * Find where the winner/loser of a bracket match feed next, using template
 * winner/loser placeholders (not materialized team slots).
 */
export function getPlayoffMatchDestinations(
  structure: PlayoffBracketStructure,
  bracketMatchId: string
): PlayoffMatchDestinations {
  const winnerTo: string[] = [];
  const loserTo: string[] = [];
  for (const m of listAllBracketMatches(structure)) {
    for (const ref of [m.teamA, m.teamB]) {
      if (ref.type === "winner" && ref.matchId === bracketMatchId) {
        winnerTo.push(m.id);
      } else if (ref.type === "loser" && ref.matchId === bracketMatchId) {
        loserTo.push(m.id);
      }
    }
  }
  return {
    winnerTo,
    loserTo,
    loserEliminated: loserTo.length === 0,
  };
}

export { winnersRoundKey, losersRoundKey, PLAY_INS_ROUND_KEY, FINAL_ROUND_KEY };
