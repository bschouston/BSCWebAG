import { NextRequest, NextResponse } from "next/server";
import { getMatchDeleteBlockers } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { deleteUpcomingMatchesBulk } from "@/lib/tournament-stats-rebuild";
import {
  countActiveLocksForMatch,
  isTournamentPlayoffsActive,
} from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

/**
 * Delete all pool / round-robin schedule matches (phase !== PLAYOFF).
 * All-or-nothing: blocked while playoffs are active, or if any pool match is
 * IN_PROGRESS or has an active tracker lock. Completed pool matches are deletable.
 */
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
          error:
            "Cannot delete schedule matches while playoffs are active — delete playoffs first",
          blockers: [
            "Pool matches cannot be deleted while playoffs are active — delete playoffs first",
          ],
          deletedCount: 0,
        },
        { status: 409 }
      );
    }

    const matchesSnap = await tournamentRef.collection("matches").get();
    const scheduleMatches = matchesSnap.docs.filter((d) => {
      const phase = String((d.data() as { phase?: string }).phase ?? "");
      return phase !== "PLAYOFF";
    });

    if (!scheduleMatches.length) {
      return NextResponse.json({ ok: true, deletedCount: 0 });
    }

    // All-or-nothing: every pool match must be deletable before we delete any.
    const blockers: string[] = [];
    for (const doc of scheduleMatches) {
      const match = doc.data() as Record<string, unknown>;
      const activeLockCount = await countActiveLocksForMatch(adminDb, tournamentId, doc.id);
      const matchBlockers = getMatchDeleteBlockers(
        {
          status: match.status as string | undefined,
          phase: match.phase as string | undefined,
          playSeq: match.playSeq as number | undefined,
          startedAt: match.startedAt,
          completedAt: match.completedAt,
          lastPlayAt: match.lastPlayAt,
          winnerTeamId: match.winnerTeamId as string | null | undefined,
        },
        { activeLockCount, playoffsActive: false }
      );
      for (const b of matchBlockers) {
        blockers.push(`Match ${doc.id}: ${b}`);
      }
    }

    if (blockers.length) {
      return NextResponse.json(
        {
          error:
            "Cannot delete all schedule matches — no match may be in progress or have an active tracker lock (nothing was deleted)",
          blockers,
          deletedCount: 0,
        },
        { status: 409 }
      );
    }

    const matchIds = scheduleMatches.map((d) => d.id);
    const { matchesDeleted } = await deleteUpcomingMatchesBulk(
      adminDb,
      tournamentId,
      matchIds,
      { rebuild: true }
    );

    return NextResponse.json({ ok: true, deletedCount: matchesDeleted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete schedule matches";
    console.error("Delete all schedule matches error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
