import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { normalizeTrackerEmail, type TrackerAuditAction } from "@bsc/shared";

export type TrackerAuditLogInput = {
  userId: string;
  userEmail: string | null;
  userDisplayName: string;
  action: TrackerAuditAction;
  tournamentId?: string | null;
  tournamentName?: string | null;
  matchId?: string | null;
  teamKey?: "A" | "B" | null;
  teamId?: string | null;
  teamName?: string | null;
  setNumber?: number | null;
  statKey?: string | null;
  statLabel?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  details?: Record<string, unknown> | null;
};

export async function writeTrackerAuditLog(
  adminDb: Firestore,
  entry: TrackerAuditLogInput
): Promise<void> {
  try {
    await adminDb.collection("trackerAuditLogs").add({
      ...entry,
      userEmail: entry.userEmail ? normalizeTrackerEmail(entry.userEmail) : null,
      createdAt: Timestamp.now(),
    });
  } catch (err) {
    console.error("Failed to write tracker audit log", err);
  }
}

export type TrackerMatchContext = {
  tournamentId: string;
  tournamentName?: string | null;
  matchId: string;
  teamAId?: string;
  teamBId?: string;
  teamAName?: string | null;
  teamBName?: string | null;
};

export async function loadTrackerMatchContext(
  adminDb: Firestore,
  tournamentId: string,
  matchId: string
): Promise<TrackerMatchContext | null> {
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const [tournamentSnap, matchSnap, teamsSnap] = await Promise.all([
    tournamentRef.get(),
    tournamentRef.collection("matches").doc(matchId).get(),
    tournamentRef.collection("teams").get(),
  ]);
  if (!tournamentSnap.exists || !matchSnap.exists) return null;

  const match = matchSnap.data() as { teamAId?: string; teamBId?: string };
  const teamNames = new Map(
    teamsSnap.docs.map((d) => [d.id, String((d.data() as { name?: string }).name ?? d.id)])
  );

  return {
    tournamentId,
    tournamentName: String((tournamentSnap.data() as { name?: string })?.name ?? ""),
    matchId,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    teamAName: match.teamAId ? teamNames.get(match.teamAId) ?? null : null,
    teamBName: match.teamBId ? teamNames.get(match.teamBId) ?? null : null,
  };
}

export function teamFromContext(
  ctx: TrackerMatchContext,
  teamKey: "A" | "B"
): { teamId: string | null; teamName: string | null } {
  if (teamKey === "A") {
    return { teamId: ctx.teamAId ?? null, teamName: ctx.teamAName ?? null };
  }
  return { teamId: ctx.teamBId ?? null, teamName: ctx.teamBName ?? null };
}

export async function logTrackerMatchAction(
  adminDb: Firestore,
  user: { uid: string; email: string | null; displayName: string },
  tournamentId: string,
  matchId: string,
  teamKey: "A" | "B" | null,
  action: TrackerAuditAction,
  extra?: Partial<Omit<TrackerAuditLogInput, "userId" | "userEmail" | "userDisplayName" | "action">>
): Promise<void> {
  const ctx = await loadTrackerMatchContext(adminDb, tournamentId, matchId);
  const team =
    teamKey && ctx ? teamFromContext(ctx, teamKey) : { teamId: null, teamName: null };
  void writeTrackerAuditLog(adminDb, {
    userId: user.uid,
    userEmail: user.email,
    userDisplayName: user.displayName,
    action,
    tournamentId,
    tournamentName: ctx?.tournamentName ?? null,
    matchId,
    teamKey,
    teamId: team.teamId,
    teamName: team.teamName,
    ...extra,
  });
}
