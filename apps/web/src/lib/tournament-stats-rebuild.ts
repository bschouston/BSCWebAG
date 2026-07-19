import {
  aggregatePlayerStatsFromPlays,
  getStatTracker,
  type TrackerStat,
} from "@bsc/shared";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";

type SetScore = { a: number; b: number };

const STAT_COUNTER_FIELDS = new Set([
  "aces",
  "serveErrors",
  "receives",
  "receiveErrors",
  "assists",
  "attempts",
  "kills",
  "attackErrors",
  "blocks",
  "digs",
  "pointsScored",
  "opponentErrors",
]);

type TeamTotals = {
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
};

function emptyTeamTotals(): TeamTotals {
  return {
    wins: 0,
    losses: 0,
    setsWon: 0,
    setsLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

function sportFromTrackerId(statTrackerId: string): string {
  try {
    return getStatTracker(statTrackerId).sport;
  } catch {
    return statTrackerId.split(".")[0] || "volleyball";
  }
}

/** Completed-set wins per side — mirrors tracker match-edit helper. */
function completedSetWins(
  setScores: SetScore[],
  status: string,
  currentSet: number
): { a: number; b: number } {
  const upTo =
    status === "COMPLETED" ? setScores.length : Math.min(currentSet - 1, setScores.length);
  let a = 0;
  let b = 0;
  for (let i = 0; i < upTo; i++) {
    const s = setScores[i];
    if (s.a > s.b) a++;
    else if (s.b > s.a) b++;
  }
  return { a, b };
}

async function deleteRefsInBatches(adminDb: Firestore, refs: DocumentReference[]): Promise<void> {
  let batch = adminDb.batch();
  let ops = 0;
  for (const ref of refs) {
    batch.delete(ref);
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

/**
 * Rebuild playerStats counters, matchesPlayed, and teamStats from all remaining
 * matches and plays. Used after match deletion and manual stats repair.
 */
export async function rebuildTournamentAggregates(
  adminDb: Firestore,
  tournamentId: string
): Promise<{ playersUpdated: number; teamsUpdated: number; playsScanned: number }> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    throw new Error("Tournament not found");
  }

  const statTrackerId = String((tournamentSnap.data() as { statTrackerId?: string })?.statTrackerId ?? "volleyball.v1");
  const sport = sportFromTrackerId(statTrackerId);

  const configSnap = await adminDb.collection("trackerConfigs").doc(sport).get();
  const stats = (configSnap.data() as { stats?: TrackerStat[] } | undefined)?.stats;
  if (!stats?.length) {
    throw new Error("Tracker config not found");
  }

  const statsByKey = new Map(stats.map((s) => [s.key, s]));
  const aggregateFields = new Set(stats.map((s) => s.aggregateField));

  const [playersSnap, teamsSnap, matchesSnap, existingStatsSnap] = await Promise.all([
    tournamentRef.collection("players").get(),
    tournamentRef.collection("teams").get(),
    tournamentRef.collection("matches").get(),
    tournamentRef.collection("playerStats").get(),
  ]);

  const playersById = new Map(
    playersSnap.docs.map((d) => {
      const data = d.data() as { teamId?: string | null; displayName?: string | null };
      return [d.id, { teamId: data.teamId, displayName: data.displayName }];
    })
  );

  const teamTotals = new Map<string, TeamTotals>();
  for (const teamDoc of teamsSnap.docs) {
    teamTotals.set(teamDoc.id, emptyTeamTotals());
  }

  const allPlays: { entries: { playerId: string | null; statKey: string }[]; deleted?: boolean }[] =
    [];
  const matchesPlayed = new Map<string, number>();

  for (const matchDoc of matchesSnap.docs) {
    const match = matchDoc.data() as {
      status?: string;
      teamAId?: string;
      teamBId?: string;
      winnerTeamId?: string | null;
      currentSet?: number;
      setScores?: SetScore[];
    };

    const teamAId = String(match.teamAId ?? "");
    const teamBId = String(match.teamBId ?? "");
    const status = String(match.status ?? "UPCOMING");
    const currentSet = match.currentSet ?? 1;
    const setScores: SetScore[] = (match.setScores ?? [{ a: 0, b: 0 }]).map((s) => ({
      a: s?.a ?? 0,
      b: s?.b ?? 0,
    }));

    if (teamAId && teamBId && status !== "UPCOMING") {
      const setWins = completedSetWins(setScores, status, currentSet);
      const aTotals = teamTotals.get(teamAId) ?? emptyTeamTotals();
      const bTotals = teamTotals.get(teamBId) ?? emptyTeamTotals();
      aTotals.setsWon += setWins.a;
      aTotals.setsLost += setWins.b;
      bTotals.setsWon += setWins.b;
      bTotals.setsLost += setWins.a;
      teamTotals.set(teamAId, aTotals);
      teamTotals.set(teamBId, bTotals);
    }

    if (status === "COMPLETED" && teamAId && teamBId) {
      const winnerId = String(match.winnerTeamId ?? "");
      const loserId = winnerId === teamAId ? teamBId : teamAId;
      if (winnerId && teamTotals.has(winnerId)) {
        const w = teamTotals.get(winnerId)!;
        w.wins += 1;
        teamTotals.set(winnerId, w);
      }
      if (loserId && teamTotals.has(loserId)) {
        const l = teamTotals.get(loserId)!;
        l.losses += 1;
        teamTotals.set(loserId, l);
      }

      for (const playerDoc of playersSnap.docs) {
        const teamId = (playerDoc.data() as { teamId?: string | null }).teamId;
        if (teamId === teamAId || teamId === teamBId) {
          matchesPlayed.set(playerDoc.id, (matchesPlayed.get(playerDoc.id) ?? 0) + 1);
        }
      }
    }

    const playsSnap = await matchDoc.ref.collection("plays").get();
    for (const playDoc of playsSnap.docs) {
      const data = playDoc.data() as {
        entries?: { playerId: string | null; statKey: string }[];
        deleted?: boolean;
        pointTo?: string | null;
      };
      allPlays.push({ entries: data.entries ?? [], deleted: data.deleted });

      if (data.deleted || !data.pointTo || !teamAId || !teamBId) continue;
      const scoringTeamId = data.pointTo === "A" ? teamAId : teamBId;
      const concedingTeamId = data.pointTo === "A" ? teamBId : teamAId;
      const scoring = teamTotals.get(scoringTeamId) ?? emptyTeamTotals();
      const conceding = teamTotals.get(concedingTeamId) ?? emptyTeamTotals();
      scoring.pointsFor += 1;
      conceding.pointsAgainst += 1;
      teamTotals.set(scoringTeamId, scoring);
      teamTotals.set(concedingTeamId, conceding);
    }
  }

  const recomputed = aggregatePlayerStatsFromPlays(allPlays, statsByKey, playersById);

  let batch = adminDb.batch();
  let ops = 0;
  let playersUpdated = 0;

  for (const playerDoc of playersSnap.docs) {
    const playerId = playerDoc.id;
    const player = playerDoc.data() as { teamId?: string | null; displayName?: string | null };
    const existing = existingStatsSnap.docs.find((d) => d.id === playerId)?.data() as
      | Record<string, unknown>
      | undefined;
    const counts = recomputed.get(playerId) ?? {};

    const next: Record<string, unknown> = {
      playerId,
      teamId: player.teamId ?? null,
      displayName: player.displayName ?? null,
      matchesPlayed: matchesPlayed.get(playerId) ?? 0,
    };

    if (existing) {
      for (const [field, value] of Object.entries(existing)) {
        if (
          field === "playerId" ||
          field === "teamId" ||
          field === "displayName" ||
          field === "matchesPlayed" ||
          STAT_COUNTER_FIELDS.has(field) ||
          aggregateFields.has(field)
        ) {
          continue;
        }
        next[field] = value;
      }
    }

    for (const field of aggregateFields) next[field] = 0;
    next.pointsScored = 0;
    for (const [field, value] of Object.entries(counts)) {
      next[field] = value;
    }

    batch.set(tournamentRef.collection("playerStats").doc(playerId), next, { merge: true });
    playersUpdated += 1;
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }

  let teamsUpdated = 0;
  for (const teamDoc of teamsSnap.docs) {
    const totals = teamTotals.get(teamDoc.id) ?? emptyTeamTotals();
    batch.set(
      tournamentRef.collection("teamStats").doc(teamDoc.id),
      { teamId: teamDoc.id, ...totals },
      { merge: true }
    );
    teamsUpdated += 1;
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  return {
    playersUpdated,
    teamsUpdated,
    playsScanned: allPlays.filter((p) => !p.deleted).length,
  };
}

/** Delete a match, its plays/locks, then rebuild all tournament aggregates. */
export async function deleteTournamentMatch(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string
): Promise<{ playsDeleted: number }> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new Error("Match not found");
  }

  const playsSnap = await matchRef.collection("plays").get();
  await deleteRefsInBatches(
    adminDb,
    playsSnap.docs.map((d) => d.ref)
  );

  const lockRefs: DocumentReference[] = [];
  for (const teamKey of ["A", "B"] as const) {
    const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) lockRefs.push(lockRef);
  }
  if (lockRefs.length > 0) {
    await deleteRefsInBatches(adminDb, lockRefs);
  }

  await matchRef.delete();
  await rebuildTournamentAggregates(adminDb, tournamentId);

  return { playsDeleted: playsSnap.size };
}

/**
 * Bulk-delete unplayed upcoming matches (and their empty plays/locks).
 * Skips aggregate rebuild when `rebuild` is false — safe for unplayed matches
 * that never contributed stats.
 */
export async function deleteUpcomingMatchesBulk(
  adminDb: Firestore,
  tournamentId: string,
  matchIds: string[],
  options?: { rebuild?: boolean }
): Promise<{ matchesDeleted: number }> {
  if (!matchIds.length) return { matchesDeleted: 0 };

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const refs: DocumentReference[] = [];

  for (const matchId of matchIds) {
    const matchRef = tournamentRef.collection("matches").doc(matchId);
    const playsSnap = await matchRef.collection("plays").get();
    refs.push(...playsSnap.docs.map((d) => d.ref));
    for (const teamKey of ["A", "B"] as const) {
      const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
      const lockSnap = await lockRef.get();
      if (lockSnap.exists) refs.push(lockRef);
    }
    refs.push(matchRef);
  }

  await deleteRefsInBatches(adminDb, refs);
  if (options?.rebuild !== false) {
    await rebuildTournamentAggregates(adminDb, tournamentId);
  }
  return { matchesDeleted: matchIds.length };
}
