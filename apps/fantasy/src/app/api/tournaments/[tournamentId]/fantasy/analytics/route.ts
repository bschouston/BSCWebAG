import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const [teamsSnap, playersSnap, realTeamsSnap] = await Promise.all([
    adminDb.collection("tournaments").doc(tournamentId).collection("fantasyTeams").get(),
    adminDb.collection("tournaments").doc(tournamentId).collection("players").get(),
    adminDb.collection("tournaments").doc(tournamentId).collection("teams").get(),
  ]);

  const playerName = new Map(
    playersSnap.docs.map((d) => [
      d.id,
      String((d.data() as { displayName?: string }).displayName ?? "Player"),
    ])
  );
  const playerTeamId = new Map(
    playersSnap.docs.map((d) => [
      d.id,
      String((d.data() as { teamId?: string }).teamId ?? ""),
    ])
  );
  const realTeamName = new Map(
    realTeamsSnap.docs.map((d) => [
      d.id,
      String((d.data() as { name?: string }).name ?? d.id),
    ])
  );

  const playerCounts = new Map<string, number>();
  const realTeamCounts = new Map<string, number>();
  let lockedCount = 0;

  for (const doc of teamsSnap.docs) {
    const data = doc.data() as { playerIds?: string[]; locked?: boolean };
    if (data.locked) lockedCount += 1;
    for (const pid of data.playerIds ?? []) {
      playerCounts.set(pid, (playerCounts.get(pid) ?? 0) + 1);
      const tid = playerTeamId.get(pid);
      if (tid) realTeamCounts.set(tid, (realTeamCounts.get(tid) ?? 0) + 1);
    }
  }

  const mostUsedPlayers = [...playerCounts.entries()]
    .map(([playerId, count]) => ({
      playerId,
      displayName: playerName.get(playerId) ?? "Player",
      count,
    }))
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName))
    .slice(0, 25);

  const mostUsedTeams = [...realTeamCounts.entries()]
    .map(([teamId, count]) => ({
      teamId,
      name: realTeamName.get(teamId) ?? teamId,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 25);

  return NextResponse.json({
    fantasyTeamCount: teamsSnap.size,
    lockedCount,
    mostUsedPlayers,
    mostUsedTeams,
  });
}
