import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { TeamKeySchema, categoryCountsTowardPoints, type TrackerStat } from "@bsc/shared";
import { getAdminDb } from "../../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../../lib/server-auth";
import { getOrSeedTrackerConfig } from "../../../../../../../../lib/tracker-config-server";
import {
  getActiveUnlock,
  sportFromStatTrackerId,
  unlockCoversSet,
} from "../../../../../../../../lib/match-edit";
import { computeDerivedScoreUpdates } from "../../../../../../../../lib/match-scoring-server";
import { logTrackerMatchAction } from "../../../../../../../../lib/tracker-audit";

export const dynamic = "force-dynamic";

/**
 * Soft-delete a selected play and reverse its score + aggregate effects.
 * `playId` selects the history row; omitting it retains the legacy behavior
 * of deleting the team's latest play in the requested set.
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
  const requestedSet =
    typeof body?.setNumber === "number" && Number.isInteger(body.setNumber) && body.setNumber >= 1
      ? (body.setNumber as number)
      : null;
  const requestedPlayId =
    typeof body?.playId === "string" && body.playId.trim() ? body.playId.trim() : null;

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  const sport = sportFromStatTrackerId(
    String((tournamentSnap.data() as any)?.statTrackerId ?? "volleyball.v1")
  );

  let statsByKey: Map<string, TrackerStat>;
  try {
    const config = await getOrSeedTrackerConfig(sport);
    statsByKey = new Map(config.stats.map((s) => [s.key, s]));
  } catch (err) {
    console.error("Tracker config load failed", err);
    return NextResponse.json({ error: "Tracker config unavailable" }, { status: 500 });
  }

  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
  const now = Timestamp.now();

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [lockSnap, matchSnap] = await Promise.all([t.get(lockRef), t.get(matchRef)]);

      if (!matchSnap.exists) return { status: 404 as const, error: "Match not found" };
      const match = matchSnap.data() as any;

      const currentSet = match.currentSet ?? 1;
      const targetSet = requestedSet ?? currentSet;
      const editingLockedScope = match.status === "COMPLETED" || targetSet !== currentSet;

      if (editingLockedScope) {
        const unlock = getActiveUnlock(match);
        if (!unlockCoversSet(unlock, targetSet)) {
          return {
            status: 423 as const,
            error: "This set is locked. Enter the passcode to unlock editing.",
          };
        }
      } else {
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
      }

      let playDoc: FirebaseFirestore.DocumentSnapshot;
      if (requestedPlayId) {
        playDoc = await t.get(matchRef.collection("plays").doc(requestedPlayId));
        if (!playDoc.exists) {
          return { status: 404 as const, error: "Play not found" };
        }
        const selected = playDoc.data() as any;
        if (
          selected.deleted ||
          selected.teamKey !== teamKey ||
          selected.setNumber !== targetSet
        ) {
          return { status: 400 as const, error: "This play cannot be deleted here" };
        }
      } else {
        // Legacy fallback: find the newest undeleted play in the target set.
        const recentPlaysSnap = await t.get(
          matchRef
            .collection("plays")
            .where("teamKey", "==", teamKey)
            .where("deleted", "==", false)
            .orderBy("seq", "desc")
            .limit(100)
        );
        const latest = recentPlaysSnap.docs.find(
          (d) => (d.data() as any).setNumber === targetSet
        );
        if (!latest) {
          return { status: 404 as const, error: "No plays to delete in this set" };
        }
        playDoc = latest;
      }
      const play = playDoc.data() as any;
      const scoreDelta =
        play.pointTo == null
          ? 0
          : play.kind === "score_adjust" && typeof play.delta === "number"
            ? play.delta
            : 1;

      const oldSetScores: { a: number; b: number }[] = (match.setScores ?? []).map((s: any) => ({
        a: s?.a ?? 0,
        b: s?.b ?? 0,
      }));
      const setScores = oldSetScores.map((s) => ({ ...s }));

      if (play.pointTo && scoreDelta !== 0) {
        const idx = Math.min(targetSet - 1, setScores.length - 1);
        if (idx >= 0) {
          if (play.pointTo === "A") {
            setScores[idx].a = Math.max(0, setScores[idx].a - scoreDelta);
          } else {
            setScores[idx].b = Math.max(0, setScores[idx].b - scoreDelta);
          }
        }
      }

      t.update(playDoc.ref, { deleted: true, deletedBy: user.uid, deletedAt: now });

      const matchUpdates: Record<string, unknown> = { setScores, lastPlayAt: now };

      if (editingLockedScope && play.pointTo && scoreDelta !== 0) {
        const derived = computeDerivedScoreUpdates({
          status: match.status,
          currentSet,
          oldSetScores,
          newSetScores: setScores,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          oldWinnerTeamId: match.winnerTeamId ?? null,
        });
        Object.assign(matchUpdates, derived.matchUpdates);
        for (const [teamId, fields] of Object.entries(derived.teamStatDeltas)) {
          const inc: Record<string, unknown> = { teamId };
          for (const [field, by] of Object.entries(fields)) {
            inc[field] = FieldValue.increment(by);
          }
          t.set(tournamentRef.collection("teamStats").doc(teamId), inc, { merge: true });
        }
      }

      t.update(matchRef, matchUpdates);

      for (const entry of play.entries ?? []) {
        if (!entry?.playerId || !entry?.statKey) continue;
        const stat = statsByKey.get(entry.statKey);
        if (!stat) continue;
        const decrements: Record<string, unknown> = {
          [stat.aggregateField]: FieldValue.increment(-1),
        };
        if (categoryCountsTowardPoints(stat.category)) {
          decrements.pointsScored = FieldValue.increment(-1);
        }
        t.set(
          tournamentRef.collection("playerStats").doc(entry.playerId),
          decrements,
          { merge: true }
        );
      }

      if (play.pointTo && scoreDelta !== 0) {
        const scoringTeamId = play.pointTo === "A" ? match.teamAId : match.teamBId;
        const concedingTeamId = play.pointTo === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(scoringTeamId),
          { pointsFor: FieldValue.increment(-scoreDelta) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(concedingTeamId),
          { pointsAgainst: FieldValue.increment(-scoreDelta) },
          { merge: true }
        );
      }

      return { status: 200 as const, deletedPlayId: playDoc.id, setScores };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    void logTrackerMatchAction(adminDb, user, tournamentId, matchId, teamKey, "play_delete", {
      setNumber: requestedSet,
      details: { deletedPlayId: result.deletedPlayId, selectedFromHistory: !!requestedPlayId },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Delete play failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
