import { NextRequest, NextResponse } from "next/server";
import { getMatchResetBlockers } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  rebuildTournamentAggregates,
  resetTournamentMatch,
} from "@/lib/tournament-stats-rebuild";
import {
  countActiveLocksForMatch,
  isTournamentPlayoffsActive,
} from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const { tournamentId } = await params;
    const adminDb = getAdminDb();
    const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const playoffsActive = await isTournamentPlayoffsActive(adminDb, tournamentId);
    if (playoffsActive) {
      return NextResponse.json(
        {
          error: "Cannot reset matches while playoffs are active — delete playoffs first",
          blockers: [
            "Matches cannot be reset while playoffs are active — delete playoffs first",
          ],
        },
        { status: 409 }
      );
    }

    const matchesSnap = await tournamentRef.collection("matches").get();
    const toReset: string[] = [];
    const skipped: { matchId: string; reasons: string[] }[] = [];

    for (const doc of matchesSnap.docs) {
      const match = doc.data() as Record<string, unknown>;
      const status = String(match.status ?? "UPCOMING");
      const phase = String(match.phase ?? "");
      // Only consider completed RR candidates; others are ignored (not reported as skipped).
      if (status !== "COMPLETED" || phase === "PLAYOFF") continue;

      const activeLockCount = await countActiveLocksForMatch(adminDb, tournamentId, doc.id);
      const blockers = getMatchResetBlockers(
        {
          status,
          phase,
          playSeq: match.playSeq as number | undefined,
          startedAt: match.startedAt,
          completedAt: match.completedAt,
          lastPlayAt: match.lastPlayAt,
          winnerTeamId: match.winnerTeamId as string | null | undefined,
        },
        { activeLockCount, playoffsActive: false }
      );
      if (blockers.length) {
        skipped.push({ matchId: doc.id, reasons: blockers });
      } else {
        toReset.push(doc.id);
      }
    }

    if (!toReset.length) {
      return NextResponse.json({
        ok: true,
        matchesReset: 0,
        playsDeleted: 0,
        skipped,
      });
    }

    let playsDeleted = 0;
    for (const matchId of toReset) {
      const result = await resetTournamentMatch(adminDb, tournamentId, matchId, {
        rebuild: false,
      });
      playsDeleted += result.playsDeleted;
    }
    await rebuildTournamentAggregates(adminDb, tournamentId);

    return NextResponse.json({
      ok: true,
      matchesReset: toReset.length,
      playsDeleted,
      skipped,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reset matches";
    console.error("Reset all matches error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
