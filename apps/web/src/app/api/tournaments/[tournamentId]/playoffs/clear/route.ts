import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { resolvePlayoffConfig } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { deleteUpcomingMatchesBulk } from "@/lib/tournament-stats-rebuild";
import {
  countActiveLocksForMatch,
  countPlaysForMatch,
  getMatchDeleteBlockers,
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

    const matchesSnap = await tournamentRef.collection("matches").get();
    const playoffMatches = matchesSnap.docs.filter((d) => {
      const data = d.data() as { phase?: string; bracketMatchId?: string };
      return data.phase === "PLAYOFF" && data.bracketMatchId;
    });

    // All-or-nothing: every published playoff match must be deletable before we
    // delete any matches or remove the saved bracket.
    const blockers: string[] = [];
    for (const doc of playoffMatches) {
      const match = doc.data() as Record<string, unknown>;
      const bracketMatchId = String(match.bracketMatchId ?? doc.id);
      const [activeLockCount, playCount] = await Promise.all([
        countActiveLocksForMatch(adminDb, tournamentId, doc.id),
        countPlaysForMatch(adminDb, tournamentId, doc.id),
      ]);
      const matchBlockers = getMatchDeleteBlockers(
        {
          status: match.status as string | undefined,
          phase: "PLAYOFF",
          playSeq: match.playSeq as number | undefined,
          startedAt: match.startedAt,
          completedAt: match.completedAt,
          lastPlayAt: match.lastPlayAt,
          winnerTeamId: match.winnerTeamId as string | null | undefined,
        },
        { activeLockCount, playCount },
        { allowCompletedPlayoff: true }
      );
      for (const b of matchBlockers) {
        blockers.push(`Playoff match ${bracketMatchId}: ${b}`);
      }
    }

    if (blockers.length) {
      return NextResponse.json(
        {
          error:
            "Cannot clear playoffs — no playoff match may be in progress or have an active tracker lock (nothing was deleted)",
          blockers,
          deletedCount: 0,
        },
        { status: 409 }
      );
    }

    const playoffMatchIds = playoffMatches.map((d) => d.id);
    const { matchesDeleted } = await deleteUpcomingMatchesBulk(
      adminDb,
      tournamentId,
      playoffMatchIds,
      { rebuild: true }
    );

    const playoffConfig = {
      ...resolvePlayoffConfig(tournamentSnap.data()?.playoffConfig),
      reseedEnabled: false,
      reseedRoundKeys: [],
    };

    await tournamentRef.update({
      playoffBracket: FieldValue.delete(),
      lastPlayoffGenerateAt: FieldValue.delete(),
      lastPlayoffGenerationId: FieldValue.delete(),
      championTeamId: FieldValue.delete(),
      championCrownedAt: FieldValue.delete(),
      championBracketMatchId: FieldValue.delete(),
      playoffConfig,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ ok: true, deletedMatches: matchesDeleted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to clear playoff bracket";
    console.error("Clear playoff bracket error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
