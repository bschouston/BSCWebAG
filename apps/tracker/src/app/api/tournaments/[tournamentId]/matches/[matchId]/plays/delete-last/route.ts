import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { TeamKeySchema, getStatKeyDefinition } from "@bsc/shared";
import { getAdminDb } from "../../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Soft-delete the caller's most recent play for their team and reverse the
 * score + aggregate effects. Restricted to plays in the current set so set
 * boundaries stay consistent (admins can correct older plays from the web).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { tournamentId, matchId } = await params;
  const adminDb = getAdminDb();

  const body = (await req.json().catch(() => ({}))) as any;
  const teamKeyParsed = TeamKeySchema.safeParse(body?.teamKey);
  if (!teamKeyParsed.success) {
    return NextResponse.json({ error: "Invalid teamKey" }, { status: 400 });
  }
  const teamKey = teamKeyParsed.data as "A" | "B";

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
  const now = Timestamp.now();

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [lockSnap, matchSnap, lastPlaySnap] = await Promise.all([
        t.get(lockRef),
        t.get(matchRef),
        t.get(
          matchRef
            .collection("plays")
            .where("teamKey", "==", teamKey)
            .where("deleted", "==", false)
            .orderBy("seq", "desc")
            .limit(1)
        ),
      ]);

      const lock = lockSnap.data() as any;
      const lockExpiresMs = (lock?.expiresAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      if (
        !lockSnap.exists ||
        lock?.ownerUid !== user.uid ||
        lock?.releasedAt ||
        lockExpiresMs <= now.toMillis()
      ) {
        return { status: 423 as const, error: "You no longer hold the lock for this team" };
      }

      if (!matchSnap.exists) return { status: 404 as const, error: "Match not found" };
      const match = matchSnap.data() as any;

      if (lastPlaySnap.empty) {
        return { status: 404 as const, error: "No plays to delete" };
      }
      const playDoc = lastPlaySnap.docs[0];
      const play = playDoc.data() as any;

      if (play.setNumber !== (match.currentSet ?? 1)) {
        return {
          status: 409 as const,
          error: "Play belongs to a finished set; ask an admin to correct it",
        };
      }

      const setScores: { a: number; b: number }[] = (match.setScores ?? []).map((s: any) => ({
        a: s?.a ?? 0,
        b: s?.b ?? 0,
      }));

      if (play.pointTo) {
        const idx = Math.min((match.currentSet ?? 1) - 1, setScores.length - 1);
        if (idx >= 0) {
          if (play.pointTo === "A") setScores[idx].a = Math.max(0, setScores[idx].a - 1);
          else setScores[idx].b = Math.max(0, setScores[idx].b - 1);
        }
      }

      t.update(playDoc.ref, { deleted: true, deletedBy: user.uid, deletedAt: now });
      t.update(matchRef, { setScores, lastPlayAt: now });

      for (const entry of play.entries ?? []) {
        if (!entry?.playerId || !entry?.statKey) continue;
        let def;
        try {
          def = getStatKeyDefinition(entry.statKey);
        } catch {
          continue;
        }
        const decrements: Record<string, unknown> = {
          [def.aggregateField]: FieldValue.increment(-1),
        };
        if (def.outcome === "point_for") {
          decrements.pointsScored = FieldValue.increment(-1);
        }
        t.set(
          tournamentRef.collection("playerStats").doc(entry.playerId),
          decrements,
          { merge: true }
        );
      }

      if (play.pointTo) {
        const scoringTeamId = play.pointTo === "A" ? match.teamAId : match.teamBId;
        const concedingTeamId = play.pointTo === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(scoringTeamId),
          { pointsFor: FieldValue.increment(-1) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(concedingTeamId),
          { pointsAgainst: FieldValue.increment(-1) },
          { merge: true }
        );
      }

      return { status: 200 as const, deletedPlayId: playDoc.id, setScores };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Delete last play failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
