import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTrackerAdmin } from "../../../../../../../lib/server-auth";
import { simulateTournamentMatch } from "../../../../../../../lib/simulate-match";
import { logTrackerMatchAction } from "../../../../../../../lib/tracker-audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTrackerAdmin(req);
  if (error) return error;

  try {
    const { tournamentId, matchId } = await params;
    const adminDb = getAdminDb();
    const result = await simulateTournamentMatch(adminDb, tournamentId, matchId, {
      recordedBy: user.uid,
      rebuild: true,
    });
    void logTrackerMatchAction(adminDb, user, tournamentId, matchId, null, "match_simulate", {
      statLabel: `Sets ${result.scoreA}–${result.scoreB} · ${result.playsWritten} plays`,
      details: {
        scoreA: result.scoreA,
        scoreB: result.scoreB,
        playsWritten: result.playsWritten,
        winnerTeamId: result.winnerTeamId,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to simulate match";
    const status =
      message === "Match not found" || message === "Tournament not found"
        ? 404
        : message.includes("in progress") ||
            message.includes("already completed") ||
            message.includes("no rostered") ||
            message.includes("missing team")
          ? 409
          : 500;
    console.error("Simulate match error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
