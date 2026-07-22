import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildMatchTeamIndex,
  collectTeamIdsFromPlayoffBracket,
  getDivisionDeleteBlockers,
  getMatchDeleteBlockers,
  getPlayerDeleteBlockers,
  getTeamDeleteBlockers,
  type PlayoffBracketDoc,
} from "@bsc/shared";

export type TournamentMatchRow = {
  id: string;
  teamAId?: string;
  teamBId?: string;
  divisionId?: string | null;
  status?: string;
  playSeq?: number;
  startedAt?: unknown;
  completedAt?: unknown;
  lastPlayAt?: unknown;
  winnerTeamId?: string | null;
};

export type TournamentDeleteContext = {
  matches: TournamentMatchRow[];
  teamsInMatches: Set<string>;
  divisionsInMatches: Set<string>;
  playoffTeamIds: Set<string>;
  teamsByDivision: Map<string, Set<string>>;
};

function isActiveLock(data: Record<string, unknown>, nowMs: number): boolean {
  if (data.releasedAt) return false;
  const expiresAt = data.expiresAt as Timestamp | undefined;
  if (!expiresAt?.toMillis) return false;
  return expiresAt.toMillis() > nowMs;
}

export async function loadTournamentDeleteContext(
  adminDb: Firestore,
  tournamentId: string
): Promise<TournamentDeleteContext> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const [tournamentSnap, matchesSnap, teamsSnap] = await Promise.all([
    tournamentRef.get(),
    tournamentRef.collection("matches").get(),
    tournamentRef.collection("teams").get(),
  ]);

  const bracket = tournamentSnap.data()?.playoffBracket as PlayoffBracketDoc | undefined;
  const playoffTeamIds = collectTeamIdsFromPlayoffBracket(bracket ?? null);

  const matches: TournamentMatchRow[] = matchesSnap.docs.map((d) => {
    const data = d.data() as Omit<TournamentMatchRow, "id">;
    return { id: d.id, ...data };
  });

  const { teamsInMatches, divisionsInMatches } = buildMatchTeamIndex(matches);

  const teamsByDivision = new Map<string, Set<string>>();
  for (const teamDoc of teamsSnap.docs) {
    const divisionId = (teamDoc.data() as { divisionId?: string | null }).divisionId;
    if (!divisionId) continue;
    const set = teamsByDivision.get(divisionId) ?? new Set<string>();
    set.add(teamDoc.id);
    teamsByDivision.set(divisionId, set);
  }

  return {
    matches,
    teamsInMatches,
    divisionsInMatches,
    playoffTeamIds,
    teamsByDivision,
  };
}

export async function countActiveLocksForMatch(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string
): Promise<number> {
  const nowMs = Timestamp.now().toMillis();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  let count = 0;
  for (const teamKey of ["A", "B"] as const) {
    const snap = await tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`).get();
    if (!snap.exists) continue;
    if (isActiveLock(snap.data() as Record<string, unknown>, nowMs)) count += 1;
  }
  return count;
}

export async function countPlaysForMatch(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string
): Promise<number> {
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId)
    .collection("plays")
    .limit(1)
    .get();
  return snap.size;
}

export async function playerAppearsInPlayLog(
  adminDb: Firestore,
  tournamentId: string,
  playerId: string,
  matchIds?: string[]
): Promise<boolean> {
  const ids =
    matchIds ??
    (
      await adminDb.collection("tournaments").doc(tournamentId).collection("matches").get()
    ).docs.map((d) => d.id);

  for (const matchId of ids) {
    const playsSnap = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId)
      .collection("plays")
      .get();
    for (const playDoc of playsSnap.docs) {
      const entries = (playDoc.data() as { entries?: { playerId?: string | null }[] }).entries;
      if (!Array.isArray(entries)) continue;
      if (entries.some((e) => e.playerId === playerId)) return true;
    }
  }
  return false;
}

export function getTeamDeleteBlockersFromContext(
  ctx: TournamentDeleteContext,
  teamId: string
): string[] {
  return getTeamDeleteBlockers({
    inMatch: ctx.teamsInMatches.has(teamId),
    inPlayoffBracket: ctx.playoffTeamIds.has(teamId),
  });
}

export function getDivisionDeleteBlockersFromContext(
  ctx: TournamentDeleteContext,
  divisionId: string
): string[] {
  const teamsInDivision = ctx.teamsByDivision.get(divisionId) ?? new Set<string>();
  const teamInDivisionInMatch = [...teamsInDivision].some((teamId) =>
    ctx.teamsInMatches.has(teamId)
  );
  return getDivisionDeleteBlockers({
    matchDivisionRef: ctx.divisionsInMatches.has(divisionId),
    teamInDivisionInMatch,
  });
}

export function getPlayerDeleteBlockersFromContext(
  ctx: TournamentDeleteContext,
  player: { teamId?: string | null },
  extras: { inPlayLog: boolean; matchesPlayed: number }
): string[] {
  const teamInMatch = player.teamId ? ctx.teamsInMatches.has(player.teamId) : false;
  return getPlayerDeleteBlockers({
    teamInMatch,
    inPlayLog: extras.inPlayLog,
    matchesPlayed: extras.matchesPlayed,
  });
}

export { getMatchDeleteBlockers };
