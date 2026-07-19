/**
 * Deterministic port of the Google Apps Script "Original" schedule mode.
 * Pair generation + court/slot assignment with lunch window and rest constraints.
 */

export type SchedulerTeam = {
  id: string;
  name: string;
  divisionId: string;
};

export type SchedulerDivision = {
  id: string;
  name: string;
};

export type RoundRobinInputConfig = {
  numberOfCourts: number;
  timePerMatchMinutes: number;
  /** YYYY-MM-DD in local tournament timezone sense (wall clock). */
  scheduleDate: string;
  /** HH:mm 24h */
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  gamesPerTeam: number;
  seed?: string;
};

export type ScheduledMatch = {
  teamAId: string;
  teamBId: string;
  divisionId: string | null;
  divisionLabel: string;
  pairingType: "DIVISION" | "CROSS";
  courtNumber: number;
  slotIndex: number;
  scheduledAt: string; // ISO
};

export type ScheduleDiagnostics = {
  totalMatches: number;
  totalSlots: number;
  endTimeIso: string;
  avoidablePartialRounds: number;
  avoidableWaste: number;
  restScore: number;
  gamesPerTeam: Record<string, number>;
};

export type ScheduleResult =
  | {
      ok: true;
      matches: ScheduledMatch[];
      diagnostics: ScheduleDiagnostics;
    }
  | { ok: false; error: string };

type PairMatch = {
  teamAId: string;
  teamBId: string;
  divisionId: string | null;
  divisionLabel: string;
  pairingType: "DIVISION" | "CROSS";
};

type ScheduleRound = {
  timeMs: number;
  matches: PairMatch[];
};

/** Mulberry32 seeded PRNG — deterministic across runs for the same seed. */
function createRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("||");
}

function parseHmToMinutes(hm: string): number {
  const m = String(hm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid time "${hm}". Use HH:mm.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`Invalid time "${hm}". Use HH:mm.`);
  }
  return h * 60 + min;
}

function dateAtMinutes(scheduleDate: string, minutesFromMidnight: number): Date {
  const [y, mo, d] = scheduleDate.split("-").map(Number);
  if (!y || !mo || !d) throw new Error(`Invalid schedule date "${scheduleDate}". Use YYYY-MM-DD.`);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  dt.setMinutes(minutesFromMidnight);
  return dt;
}

function validateConfig(config: RoundRobinInputConfig): string | null {
  if (!Number.isInteger(config.numberOfCourts) || config.numberOfCourts < 1) {
    return "Number of Courts must be a positive integer.";
  }
  if (!Number.isInteger(config.timePerMatchMinutes) || config.timePerMatchMinutes < 1) {
    return "Time per Match must be a positive integer (minutes).";
  }
  if (!Number.isInteger(config.gamesPerTeam) || config.gamesPerTeam < 1) {
    return "Games per Team must be a positive integer.";
  }
  try {
    const start = parseHmToMinutes(config.startTime);
    const lunchStart = parseHmToMinutes(config.lunchStart);
    const lunchEnd = parseHmToMinutes(config.lunchEnd);
    if (lunchEnd <= lunchStart) return "Lunch End must be after Lunch Start.";
    if (start >= lunchStart && start < lunchEnd) {
      return "Start Time cannot fall inside the lunch window.";
    }
    dateAtMinutes(config.scheduleDate, start);
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid schedule configuration.";
  }
  return null;
}

function buildPairs(
  teams: SchedulerTeam[],
  divisions: SchedulerDivision[],
  gamesPerTeam: number,
  rng: () => number
): { ok: true; matches: PairMatch[] } | { ok: false; error: string } {
  if (!teams.length) {
    return { ok: false, error: "No teams with divisions were found." };
  }

  const undivided = teams.filter((t) => !t.divisionId);
  if (undivided.length) {
    return {
      ok: false,
      error: `Every team must belong to a division. Unassigned: ${undivided
        .map((t) => t.name)
        .join(", ")}`,
    };
  }

  if ((teams.length * gamesPerTeam) % 2 !== 0) {
    return {
      ok: false,
      error:
        "The total number of requested games is not even. Change Games per Team or add/remove a team so every match has exactly two teams.",
    };
  }

  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));
  const teamsByDivision = new Map<string, SchedulerTeam[]>();
  for (const team of teams) {
    const list = teamsByDivision.get(team.divisionId) ?? [];
    list.push(team);
    teamsByDivision.set(team.divisionId, list);
  }

  const impossible: string[] = [];
  for (const [divId, group] of teamsByDivision) {
    const required = group.length - 1;
    if (gamesPerTeam < required) {
      impossible.push(
        `${divisionName.get(divId) ?? divId}: ${required} division opponents`
      );
    }
  }
  if (impossible.length) {
    return {
      ok: false,
      error:
        "Games per Team is too low to play every division opponent at least once. Increase Games per Team for: " +
        impossible.join(", "),
    };
  }

  const mandatory: PairMatch[] = [];
  const counts: Record<string, number> = Object.fromEntries(teams.map((t) => [t.id, 0]));
  const played: Record<string, number> = {};

  for (const [divId, group] of teamsByDivision) {
    const label = divisionName.get(divId) ?? divId;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        mandatory.push({
          teamAId: a.id,
          teamBId: b.id,
          divisionId: divId,
          divisionLabel: label,
          pairingType: "DIVISION",
        });
        counts[a.id]++;
        counts[b.id]++;
        played[pairKey(a.id, b.id)] = 1;
      }
    }
  }

  const totalTarget = (teams.length * gamesPerTeam) / 2;
  if (mandatory.length > totalTarget) {
    return {
      ok: false,
      error:
        "Division games alone exceed the configured Games per Team. Reduce division size or increase Games per Team.",
    };
  }

  if (mandatory.length === totalTarget) {
    const matches = mandatory.map((m) => ({ ...m }));
    shuffleInPlace(matches, rng);
    return { ok: true, matches };
  }

  const teamIds = teams.map((t) => t.id);
  const divisionOf = Object.fromEntries(teams.map((t) => [t.id, t.divisionId]));
  let fewestMissing = Infinity;
  const maxAttempts = 250;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const matches = mandatory.map((m) => ({ ...m }));
    const attemptCounts = { ...counts };
    const attemptPlayed = { ...played };
    let guard = 0;
    let failed = false;

    while (teamIds.some((id) => attemptCounts[id] < gamesPerTeam)) {
      if (++guard > 10000) {
        failed = true;
        break;
      }

      type Candidate = {
        teamAId: string;
        teamBId: string;
        pairKey: string;
        repeatPenalty: number;
        score: number;
      };
      const candidates: Candidate[] = [];

      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          const a = teamIds[i];
          const b = teamIds[j];
          if (divisionOf[a] === divisionOf[b]) continue;
          if (attemptCounts[a] >= gamesPerTeam || attemptCounts[b] >= gamesPerTeam) continue;

          const key = pairKey(a, b);
          const repeatPenalty = attemptPlayed[key] ? 1 : 0;
          candidates.push({
            teamAId: a,
            teamBId: b,
            pairKey: key,
            repeatPenalty,
            score:
              gamesPerTeam -
              attemptCounts[a] +
              (gamesPerTeam - attemptCounts[b]) +
              rng(),
          });
        }
      }

      if (!candidates.length) {
        failed = true;
        break;
      }

      const nonRepeat = candidates.filter((c) => c.repeatPenalty === 0);
      const pool = nonRepeat.length ? nonRepeat : candidates;
      pool.sort((a, b) => {
        if (a.repeatPenalty !== b.repeatPenalty) return a.repeatPenalty - b.repeatPenalty;
        return b.score - a.score;
      });

      const top = pool.slice(0, Math.min(pool.length, 10));
      const pick = top[Math.floor(rng() * top.length)];
      matches.push({
        teamAId: pick.teamAId,
        teamBId: pick.teamBId,
        divisionId: null,
        divisionLabel: "Cross",
        pairingType: "CROSS",
      });
      attemptCounts[pick.teamAId]++;
      attemptCounts[pick.teamBId]++;
      attemptPlayed[pick.pairKey] = (attemptPlayed[pick.pairKey] || 0) + 1;
    }

    const missing = teamIds.reduce(
      (sum, id) => sum + Math.max(0, gamesPerTeam - attemptCounts[id]),
      0
    );
    if (!failed && missing === 0) {
      shuffleInPlace(matches, rng);
      return { ok: true, matches };
    }
    if (missing < fewestMissing) fewestMissing = missing;
  }

  return {
    ok: false,
    error:
      "Could not create enough cross-division games without breaking the Games per Team target. Check division sizes and Games per Team. Missing team-game slots after best attempt: " +
      fewestMissing,
  };
}

function selectBestBatch(
  matches: PairMatch[],
  nCourts: number,
  currentTimeMs: number,
  teamNextAvailable: Record<string, number>,
  rng: () => number
): { indices: number[]; score: number } {
  type Cand = { idx: number; match: PairMatch; score: number };
  let candidates: Cand[] = [];

  matches.forEach((match, idx) => {
    const aReady = teamNextAvailable[match.teamAId] <= currentTimeMs;
    const bReady = teamNextAvailable[match.teamBId] <= currentTimeMs;
    if (!aReady || !bReady) return;
    const idle =
      currentTimeMs -
      teamNextAvailable[match.teamAId] +
      (currentTimeMs - teamNextAvailable[match.teamBId]);
    candidates.push({ idx, match, score: idle + rng() });
  });

  candidates.sort((a, b) => b.score - a.score);
  candidates = candidates.slice(0, Math.min(candidates.length, 90));

  let best = { indices: [] as number[], score: -Infinity };

  function search(start: number, chosen: number[], busy: Set<string>, score: number) {
    if (
      chosen.length > best.indices.length ||
      (chosen.length === best.indices.length && score > best.score)
    ) {
      best = { indices: chosen.slice(), score };
    }
    if (chosen.length === nCourts) return;
    if (start >= candidates.length) return;
    if (chosen.length + (candidates.length - start) < best.indices.length) return;

    for (let i = start; i < candidates.length; i++) {
      const c = candidates[i];
      if (busy.has(c.match.teamAId) || busy.has(c.match.teamBId)) continue;
      busy.add(c.match.teamAId);
      busy.add(c.match.teamBId);
      chosen.push(c.idx);
      search(i + 1, chosen, busy, score + c.score);
      chosen.pop();
      busy.delete(c.match.teamAId);
      busy.delete(c.match.teamBId);
    }
  }

  search(0, [], new Set(), 0);
  return best;
}

function scheduleAttempt(
  matches: PairMatch[],
  teamIds: string[],
  nCourts: number,
  startMs: number,
  lunchStartMs: number,
  lunchEndMs: number,
  matchDurationMs: number,
  rng: () => number
): { rounds: ScheduleRound[]; restScore: number; unscheduledCount: number } {
  const remaining = matches.slice();
  const teamNextAvailable = Object.fromEntries(teamIds.map((id) => [id, startMs]));
  const rounds: ScheduleRound[] = [];
  let currentTime = startMs;
  let lunchInserted = false;
  let restScore = 0;
  let guard = 0;

  while (remaining.length > 0 && guard++ < matches.length * 20 + 500) {
    if (!lunchInserted && currentTime >= lunchStartMs) {
      currentTime = lunchEndMs;
      lunchInserted = true;
    }
    if (currentTime >= lunchStartMs && currentTime < lunchEndMs) {
      currentTime = lunchEndMs;
      lunchInserted = true;
    }

    const batch = selectBestBatch(remaining, nCourts, currentTime, teamNextAvailable, rng);
    if (!batch.indices.length) {
      const future = Object.values(teamNextAvailable).filter((t) => t > currentTime);
      currentTime = future.length
        ? Math.min(...future)
        : currentTime + matchDurationMs;
      continue;
    }

    const selected = batch.indices.map((i) => remaining[i]);
    rounds.push({ timeMs: currentTime, matches: selected });
    restScore += batch.score;

    const nextTime = currentTime + matchDurationMs;
    for (const match of selected) {
      teamNextAvailable[match.teamAId] = nextTime;
      teamNextAvailable[match.teamBId] = nextTime;
    }
    batch.indices
      .slice()
      .sort((a, b) => b - a)
      .forEach((i) => remaining.splice(i, 1));
    currentTime = nextTime;
  }

  return { rounds, restScore, unscheduledCount: remaining.length };
}

function isBetter(
  candidate: {
    avoidablePartialRounds: number;
    avoidableWaste: number;
    roundCount: number;
    restScore: number;
  },
  incumbent: typeof candidate
): boolean {
  if (candidate.avoidablePartialRounds !== incumbent.avoidablePartialRounds) {
    return candidate.avoidablePartialRounds < incumbent.avoidablePartialRounds;
  }
  if (candidate.avoidableWaste !== incumbent.avoidableWaste) {
    return candidate.avoidableWaste < incumbent.avoidableWaste;
  }
  if (candidate.roundCount !== incumbent.roundCount) {
    return candidate.roundCount < incumbent.roundCount;
  }
  return candidate.restScore > incumbent.restScore;
}

function assignSlots(
  matches: PairMatch[],
  teamIds: string[],
  config: RoundRobinInputConfig,
  rng: () => number
):
  | {
      ok: true;
      rounds: ScheduleRound[];
      avoidablePartialRounds: number;
      avoidableWaste: number;
      restScore: number;
    }
  | { ok: false; error: string } {
  if (!matches.length) {
    return {
      ok: true,
      rounds: [],
      avoidablePartialRounds: 0,
      avoidableWaste: 0,
      restScore: 0,
    };
  }

  const nCourts = config.numberOfCourts;
  const startMin = parseHmToMinutes(config.startTime);
  const lunchStartMin = parseHmToMinutes(config.lunchStart);
  const lunchEndMin = parseHmToMinutes(config.lunchEnd);
  const startMs = dateAtMinutes(config.scheduleDate, startMin).getTime();
  const lunchStartMs = dateAtMinutes(config.scheduleDate, lunchStartMin).getTime();
  const lunchEndMs = dateAtMinutes(config.scheduleDate, lunchEndMin).getTime();
  const matchDurationMs = config.timePerMatchMinutes * 60_000;

  const totalMatches = matches.length;
  const expectedWaste = (nCourts - (totalMatches % nCourts)) % nCourts;
  const expectedPartial = totalMatches % nCourts === 0 ? 0 : 1;
  const attempts = Math.min(220, Math.max(60, totalMatches * 5));

  let best: {
    rounds: ScheduleRound[];
    restScore: number;
    avoidablePartialRounds: number;
    avoidableWaste: number;
    roundCount: number;
  } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptMatches = matches.map((m) => ({ ...m }));
    shuffleInPlace(attemptMatches, rng);
    const result = scheduleAttempt(
      attemptMatches,
      teamIds,
      nCourts,
      startMs,
      lunchStartMs,
      lunchEndMs,
      matchDurationMs,
      rng
    );
    if (result.unscheduledCount > 0) continue;

    const waste = result.rounds.reduce(
      (sum, round) => sum + (nCourts - round.matches.length),
      0
    );
    const partialRounds = result.rounds.filter((r) => r.matches.length < nCourts).length;
    const metrics = {
      rounds: result.rounds,
      restScore: result.restScore,
      avoidablePartialRounds: Math.max(0, partialRounds - expectedPartial),
      avoidableWaste: Math.max(0, waste - expectedWaste),
      roundCount: result.rounds.length,
    };
    if (!best || isBetter(metrics, best)) {
      best = metrics;
      if (
        best.avoidablePartialRounds === 0 &&
        best.avoidableWaste === 0 &&
        attempt >= 20
      ) {
        break;
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      error:
        "Could not place all Original schedule matches into valid time slots. Try fewer games per team or more courts.",
    };
  }

  return {
    ok: true,
    rounds: best.rounds,
    avoidablePartialRounds: best.avoidablePartialRounds,
    avoidableWaste: best.avoidableWaste,
    restScore: best.restScore,
  };
}

/** Generate an Original-mode round-robin schedule. */
export function generateOriginalRoundRobinSchedule(args: {
  teams: SchedulerTeam[];
  divisions: SchedulerDivision[];
  config: RoundRobinInputConfig;
}): ScheduleResult {
  const configError = validateConfig(args.config);
  if (configError) return { ok: false, error: configError };

  const seed =
    args.config.seed ??
    [
      args.config.scheduleDate,
      args.config.startTime,
      args.config.lunchStart,
      args.config.lunchEnd,
      args.config.numberOfCourts,
      args.config.timePerMatchMinutes,
      args.config.gamesPerTeam,
      ...args.teams.map((t) => `${t.id}:${t.divisionId}`).sort(),
    ].join("|");

  const rng = createRng(seed);
  const pairs = buildPairs(args.teams, args.divisions, args.config.gamesPerTeam, rng);
  if (!pairs.ok) return pairs;

  const teamIds = args.teams.map((t) => t.id);
  const slots = assignSlots(pairs.matches, teamIds, args.config, rng);
  if (!slots.ok) return slots;

  const scheduled: ScheduledMatch[] = [];
  slots.rounds.forEach((round, slotIndex) => {
    round.matches.forEach((match, courtIdx) => {
      scheduled.push({
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        divisionId: match.divisionId,
        divisionLabel: match.divisionLabel,
        pairingType: match.pairingType,
        courtNumber: courtIdx + 1,
        slotIndex,
        scheduledAt: new Date(round.timeMs).toISOString(),
      });
    });
  });

  const gamesPerTeam: Record<string, number> = Object.fromEntries(
    teamIds.map((id) => [id, 0])
  );
  for (const m of scheduled) {
    gamesPerTeam[m.teamAId]++;
    gamesPerTeam[m.teamBId]++;
  }

  const lastSlot = slots.rounds[slots.rounds.length - 1];
  const endTimeIso = lastSlot
    ? new Date(
        lastSlot.timeMs + args.config.timePerMatchMinutes * 60_000
      ).toISOString()
    : dateAtMinutes(
        args.config.scheduleDate,
        parseHmToMinutes(args.config.startTime)
      ).toISOString();

  return {
    ok: true,
    matches: scheduled,
    diagnostics: {
      totalMatches: scheduled.length,
      totalSlots: slots.rounds.length,
      endTimeIso,
      avoidablePartialRounds: slots.avoidablePartialRounds,
      avoidableWaste: slots.avoidableWaste,
      restScore: slots.restScore,
      gamesPerTeam,
    },
  };
}
