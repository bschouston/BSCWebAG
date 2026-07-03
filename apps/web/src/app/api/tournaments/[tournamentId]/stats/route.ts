import { NextRequest, NextResponse } from "next/server";
import { defaultStatPointWeights } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** Admin stats snapshot: aggregates, standings, weights, and reference data. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const [tournamentSnap, playerStatsSnap, teamStatsSnap, teamsSnap, playersSnap, matchesSnap] =
    await Promise.all([
      tournamentRef.get(),
      tournamentRef.collection("playerStats").get(),
      tournamentRef.collection("teamStats").get(),
      tournamentRef.collection("teams").get(),
      tournamentRef.collection("players").get(),
      tournamentRef.collection("matches").orderBy("scheduledAt", "asc").get(),
    ]);

  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  const tournament = tournamentSnap.data() as any;

  return NextResponse.json({
    statTrackerId: tournament?.statTrackerId ?? "volleyball.v1",
    statPointWeights: tournament?.statPointWeights ?? defaultStatPointWeights(),
    playerStats: playerStatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    teamStats: teamStatsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    teams: teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    players: playersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    matches: matchesSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        scheduledAt: data.scheduledAt?.toDate?.()?.toISOString?.() ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }),
  });
}
