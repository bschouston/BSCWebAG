import { NextRequest, NextResponse } from "next/server";
import { getMatchResetBlockers } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { resetTournamentMatch } from "@/lib/tournament-stats-rebuild";
import { countActiveLocksForMatch } from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const adminDb = getAdminDb();
    const { tournamentId, matchId } = await params;
    const matchRef = adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = matchSnap.data() as Record<string, unknown>;
    const activeLockCount = await countActiveLocksForMatch(adminDb, tournamentId, matchId);
    const blockers = getMatchResetBlockers(
      {
        status: match.status as string | undefined,
        phase: match.phase as string | undefined,
        playSeq: match.playSeq as number | undefined,
        startedAt: match.startedAt,
        completedAt: match.completedAt,
        lastPlayAt: match.lastPlayAt,
        winnerTeamId: match.winnerTeamId as string | null | undefined,
      },
      { activeLockCount }
    );
    if (blockers.length) {
      return NextResponse.json(
        { error: "Cannot reset match", blockers },
        { status: 409 }
      );
    }

    const result = await resetTournamentMatch(adminDb, tournamentId, matchId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reset match";
    const status = message === "Match not found" ? 404 : 500;
    console.error("Reset match error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
