import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../lib/firebase/admin";
import { requireTrackerAdmin } from "../../../../../../lib/server-auth";
import { simulateAllUpcomingMatches } from "../../../../../../lib/simulate-match";
import {
  logTrackerMatchAction,
  writeTrackerAuditLog,
} from "../../../../../../lib/tracker-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { user, error } = await requireTrackerAdmin(req);
  if (error) return error;

  try {
    const { tournamentId } = await params;
    const adminDb = getAdminDb();
    const result = await simulateAllUpcomingMatches(adminDb, tournamentId, {
      recordedBy: user.uid,
    });

    const tournamentSnap = await adminDb.collection("tournaments").doc(tournamentId).get();
    const tournamentName = String(
      (tournamentSnap.data() as { name?: string } | undefined)?.name ?? ""
    );

    for (const sim of result.simulated) {
      void logTrackerMatchAction(
        adminDb,
        user,
        tournamentId,
        sim.matchId,
        null,
        "match_simulate",
        {
          tournamentName,
          statLabel: `Sets ${sim.scoreA}–${sim.scoreB} · ${sim.playsWritten} plays`,
          details: {
            scoreA: sim.scoreA,
            scoreB: sim.scoreB,
            playsWritten: sim.playsWritten,
            winnerTeamId: sim.winnerTeamId,
            bulk: true,
          },
        }
      );
    }

    void writeTrackerAuditLog(adminDb, {
      userId: user.uid,
      userEmail: user.email,
      userDisplayName: user.displayName,
      action: "match_simulate_all",
      tournamentId,
      tournamentName,
      matchId: null,
      teamKey: null,
      statLabel: `Simulated ${result.simulated.length} · skipped ${result.skipped.length}`,
      details: {
        simulatedCount: result.simulated.length,
        skippedCount: result.skipped.length,
        simulatedMatchIds: result.simulated.map((s) => s.matchId),
        skipped: result.skipped,
      },
    });

    return NextResponse.json({
      ok: true,
      simulatedCount: result.simulated.length,
      skippedCount: result.skipped.length,
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to simulate matches";
    const status = message === "Tournament not found" ? 404 : 500;
    console.error("Simulate all matches error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
