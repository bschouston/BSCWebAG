import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { TeamKeySchema } from "@bsc/shared";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";
import {
  getActiveUnlock,
  unlockCoversSet,
} from "../../../../../../../lib/match-edit";
import { computeDerivedScoreUpdates } from "../../../../../../../lib/match-scoring-server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  teamKey: TeamKeySchema,
  /** +1 or -1 for the tracked team's points in the target set. */
  delta: z.union([z.literal(1), z.literal(-1)]),
  setNumber: z.number().int().min(1).optional(),
});

/**
 * Manually adjust the tracked team's set score (+/-). Stats are recorded
 * separately and do not auto-score; each side's tracker updates only their
 * team's points while holding the team lock (or an active passcode unlock).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { tournamentId, matchId } = await params;
  const adminDb = getAdminDb();

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { teamKey, delta } = parsed.data;

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
  const now = Timestamp.now();

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [lockSnap, matchSnap] = await Promise.all([t.get(lockRef), t.get(matchRef)]);

      if (!matchSnap.exists) return { status: 404 as const, error: "Match not found" };
      const match = matchSnap.data() as any;
      if (match.status === "UPCOMING") {
        return { status: 409 as const, error: "Match has not started" };
      }

      const currentSet = match.currentSet ?? 1;
      const targetSet = parsed.data.setNumber ?? currentSet;
      const editingLockedScope =
        match.status === "COMPLETED" || targetSet !== currentSet;

      if (editingLockedScope) {
        const unlock = getActiveUnlock(match);
        if (!unlockCoversSet(unlock, targetSet)) {
          return {
            status: 423 as const,
            error: "This set is locked. Enter the passcode to unlock editing.",
          };
        }
        if (targetSet > (match.setScores?.length ?? 0)) {
          return { status: 400 as const, error: "Set has not been played" };
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

      const oldSetScores: { a: number; b: number }[] =
        Array.isArray(match.setScores) && match.setScores.length > 0
          ? match.setScores.map((s: any) => ({ a: s?.a ?? 0, b: s?.b ?? 0 }))
          : [{ a: 0, b: 0 }];
      const setScores = oldSetScores.map((s) => ({ ...s }));

      const idx = Math.min(targetSet - 1, setScores.length - 1);
      const field = teamKey === "A" ? "a" : "b";
      const next = setScores[idx][field] + delta;
      if (next < 0) {
        return { status: 400 as const, error: "Score cannot go below zero" };
      }
      setScores[idx][field] = next;

      const matchUpdates: Record<string, unknown> = { setScores, lastPlayAt: now };

      if (editingLockedScope) {
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
          for (const [f, by] of Object.entries(fields)) {
            inc[f] = FieldValue.increment(by);
          }
          t.set(tournamentRef.collection("teamStats").doc(teamId), inc, { merge: true });
        }
      }

      t.update(matchRef, matchUpdates);

      const scoringTeamId = teamKey === "A" ? match.teamAId : match.teamBId;
      const concedingTeamId = teamKey === "A" ? match.teamBId : match.teamAId;
      t.set(
        tournamentRef.collection("teamStats").doc(scoringTeamId),
        {
          teamId: scoringTeamId,
          pointsFor: FieldValue.increment(delta),
        },
        { merge: true }
      );
      t.set(
        tournamentRef.collection("teamStats").doc(concedingTeamId),
        {
          teamId: concedingTeamId,
          pointsAgainst: FieldValue.increment(delta),
        },
        { merge: true }
      );

      return {
        status: 200 as const,
        setScores,
        points: setScores[idx][field],
      };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Score adjust failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
