import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_SET_RULES,
  isSetComplete,
  isTrackerStatVisible,
  type SetRules,
  type TrackerStat,
} from "@bsc/shared";
import { getOrSeedTrackerConfig } from "./tracker-config-server";
import { sportFromStatTrackerId } from "./match-edit";
import { rebuildTournamentAggregates } from "./tournament-stats-rebuild";

export type SimulateSkip = { matchId: string; reason: string };

export type SimulateMatchResult = {
  matchId: string;
  playsWritten: number;
  scoreA: number;
  scoreB: number;
  winnerTeamId: string;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Generate a completed set score favoring `winner` ("A" | "B"). */
function randomCompletedSetScore(
  setNumber: number,
  rules: SetRules,
  winner: "A" | "B"
): { a: number; b: number } {
  const target =
    setNumber >= rules.totalSets ? rules.pointsToWinDecidingSet : rules.pointsToWinSet;
  const winBy = Math.max(1, rules.winBy);
  const winnerPts = target + randInt(0, 3);
  const loserPts = Math.max(0, winnerPts - winBy - randInt(0, 5));
  const score = { a: 0, b: 0 };
  if (winner === "A") {
    score.a = winnerPts;
    score.b = loserPts;
  } else {
    score.b = winnerPts;
    score.a = loserPts;
  }
  if (!isSetComplete(score.a, score.b, setNumber, rules)) {
    if (winner === "A") {
      score.a = target;
      score.b = Math.max(0, target - winBy);
    } else {
      score.b = target;
      score.a = Math.max(0, target - winBy);
    }
  }
  return score;
}

async function deleteLocksForMatch(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string
): Promise<void> {
  const locks = adminDb.collection("tournaments").doc(tournamentId).collection("locks");
  for (const teamKey of ["A", "B"] as const) {
    const ref = locks.doc(`${matchId}_${teamKey}`);
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
  }
}

/**
 * Simulate one UPCOMING match to COMPLETED with random plays + legal set scores.
 * Does not rebuild aggregates unless `rebuild` is true.
 */
export async function simulateTournamentMatch(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string,
  options?: { rebuild?: boolean; recordedBy?: string }
): Promise<SimulateMatchResult> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);

  const [tournamentSnap, matchSnap] = await Promise.all([
    tournamentRef.get(),
    matchRef.get(),
  ]);
  if (!tournamentSnap.exists) throw new Error("Tournament not found");
  if (!matchSnap.exists) throw new Error("Match not found");

  const tournament = tournamentSnap.data() as { statTrackerId?: string };
  const match = matchSnap.data() as {
    status?: string;
    teamAId?: string;
    teamBId?: string;
  };
  const status = String(match.status ?? "UPCOMING");
  if (status !== "UPCOMING") {
    throw new Error(
      status === "IN_PROGRESS"
        ? "Match is in progress"
        : status === "COMPLETED"
          ? "Match is already completed"
          : `Cannot simulate match with status ${status}`
    );
  }

  const teamAId = String(match.teamAId ?? "");
  const teamBId = String(match.teamBId ?? "");
  if (!teamAId || !teamBId) {
    throw new Error("Match is missing team assignments");
  }

  const playersSnap = await tournamentRef.collection("players").get();
  const playersA: string[] = [];
  const playersB: string[] = [];
  for (const doc of playersSnap.docs) {
    const data = doc.data() as { teamId?: string | null };
    if (data.teamId === teamAId) playersA.push(doc.id);
    if (data.teamId === teamBId) playersB.push(doc.id);
  }
  if (!playersA.length) throw new Error("Team A has no rostered players");
  if (!playersB.length) throw new Error("Team B has no rostered players");

  const sport = sportFromStatTrackerId(
    String(tournament.statTrackerId ?? "volleyball.v1")
  );
  const config = await getOrSeedTrackerConfig(sport);
  const setRules: SetRules = config.setRules ?? DEFAULT_SET_RULES;
  const visibleStats = config.stats.filter(
    (s: TrackerStat) => isTrackerStatVisible(s) && s.requiresPlayer
  );
  if (!visibleStats.length) {
    throw new Error("No visible player stats available for simulation");
  }

  await deleteLocksForMatch(adminDb, tournamentId, matchId);

  const existingPlays = await matchRef.collection("plays").get();
  if (!existingPlays.empty) {
    let batch = adminDb.batch();
    let ops = 0;
    for (const d of existingPlays.docs) {
      batch.delete(d.ref);
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = adminDb.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  const now = Timestamp.now();
  const recordedBy = options?.recordedBy ?? "simulate";

  let scoreA = 0;
  let scoreB = 0;
  let playSeq = 0;
  let playsWritten = 0;
  const setScores: { a: number; b: number }[] = [];
  const playDocs: {
    seq: number;
    teamKey: "A" | "B";
    setNumber: number;
    entries: { playerId: string; statKey: string }[];
    kind?: "score_adjust" | "stat";
    delta?: number;
    pointTo?: "A" | "B" | null;
  }[] = [];

  const matchWinner: "A" | "B" = Math.random() < 0.5 ? "A" : "B";
  const setsToWin = setRules.setsToWin;
  let setNumber = 1;

  while (Math.max(scoreA, scoreB) < setsToWin && setNumber <= setRules.totalSets) {
    let setWinner: "A" | "B" = matchWinner;
    const winnerSets = matchWinner === "A" ? scoreA : scoreB;
    const loserSets = matchWinner === "A" ? scoreB : scoreA;
    const setsLeftIncludingThis = setRules.totalSets - setNumber + 1;
    if (
      loserSets < setsToWin - 1 &&
      winnerSets + (setsLeftIncludingThis - 1) >= setsToWin &&
      Math.random() < 0.35
    ) {
      setWinner = matchWinner === "A" ? "B" : "A";
    }

    const final = randomCompletedSetScore(setNumber, setRules, setWinner);

    let a = 0;
    let b = 0;
    const path: ("A" | "B")[] = [];
    while (a < final.a || b < final.b) {
      const canA = a < final.a;
      const canB = b < final.b;
      if (canA && canB) path.push(Math.random() < 0.5 ? "A" : "B");
      else if (canA) path.push("A");
      else path.push("B");
      if (path[path.length - 1] === "A") a += 1;
      else b += 1;
    }

    for (const pointTo of path) {
      const teamKey = pointTo;
      const roster = teamKey === "A" ? playersA : playersB;
      // 0–2 single-entry stat taps (same shape as live recordTap), then Score +1.
      const tapCount = randInt(0, 2);
      for (let i = 0; i < tapCount; i += 1) {
        playSeq += 1;
        playDocs.push({
          seq: playSeq,
          teamKey,
          setNumber,
          entries: [{ playerId: pick(roster), statKey: pick(visibleStats).key }],
          kind: "stat",
          pointTo: null,
        });
        playsWritten += 1;
      }
      playSeq += 1;
      playDocs.push({
        seq: playSeq,
        teamKey,
        setNumber,
        entries: [],
        kind: "score_adjust",
        delta: 1,
        pointTo: teamKey,
      });
      playsWritten += 1;
    }

    setScores.push({ a: final.a, b: final.b });
    if (setWinner === "A") scoreA += 1;
    else scoreB += 1;
    setNumber += 1;

    if (Math.max(scoreA, scoreB) >= setsToWin) break;
  }

  let batch = adminDb.batch();
  let ops = 0;
  for (const play of playDocs) {
    const playRef = matchRef.collection("plays").doc();
    batch.set(playRef, {
      ...play,
      pointTo: play.pointTo ?? null,
      recordedBy,
      createdAt: now,
      deleted: false,
      simulated: true,
    });
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }

  const winnerTeamId = scoreA > scoreB ? teamAId : teamBId;
  const currentSet = Math.max(1, setScores.length);
  batch.update(matchRef, {
    status: "COMPLETED",
    startedAt: now,
    completedAt: now,
    currentSet,
    setScores,
    scoreA,
    scoreB,
    playSeq,
    winnerTeamId,
    lastPlayAt: now,
    editUnlock: null,
  });
  ops += 1;
  await batch.commit();

  if (options?.rebuild !== false) {
    await rebuildTournamentAggregates(adminDb, tournamentId);
  }

  return { matchId, playsWritten, scoreA, scoreB, winnerTeamId };
}

export async function simulateAllUpcomingMatches(
  adminDb: Firestore,
  tournamentId: string,
  options?: { recordedBy?: string }
): Promise<{
  simulated: SimulateMatchResult[];
  skipped: SimulateSkip[];
}> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) throw new Error("Tournament not found");

  const matchesSnap = await tournamentRef.collection("matches").get();
  const simulated: SimulateMatchResult[] = [];
  const skipped: SimulateSkip[] = [];

  for (const doc of matchesSnap.docs) {
    const data = doc.data() as {
      status?: string;
      teamAId?: string;
      teamBId?: string;
    };
    const status = String(data.status ?? "UPCOMING");
    if (status !== "UPCOMING") {
      skipped.push({
        matchId: doc.id,
        reason:
          status === "IN_PROGRESS"
            ? "Match is in progress"
            : "Match is already completed",
      });
      continue;
    }
    try {
      const result = await simulateTournamentMatch(adminDb, tournamentId, doc.id, {
        rebuild: false,
        recordedBy: options?.recordedBy,
      });
      simulated.push(result);
    } catch (err) {
      skipped.push({
        matchId: doc.id,
        reason: err instanceof Error ? err.message : "Simulation failed",
      });
    }
  }

  if (simulated.length > 0) {
    await rebuildTournamentAggregates(adminDb, tournamentId);
  }

  return { simulated, skipped };
}
