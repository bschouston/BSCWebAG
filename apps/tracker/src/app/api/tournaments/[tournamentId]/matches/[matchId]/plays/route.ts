import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import {
  PlayEntrySchema,
  TeamKeySchema,
  derivePointToFromConfig,
  type TrackerStat,
} from "@bsc/shared";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";
import { getOrSeedTrackerConfig } from "../../../../../../../lib/tracker-config-server";
import {
  getActiveUnlock,
  sportFromStatTrackerId,
  unlockCoversSet,
} from "../../../../../../../lib/match-edit";
import { computeDerivedScoreUpdates } from "../../../../../../../lib/match-scoring-server";
import { logTrackerMatchAction } from "../../../../../../../lib/tracker-audit";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  teamKey: TeamKeySchema,
  entries: z.array(PlayEntrySchema).min(1).max(12),
  /** Target set; defaults to the live set. Locked sets need a passcode unlock. */
  setNumber: z.number().int().min(1).optional(),
});

/**
 * Record a play: one transaction that appends the play document, bumps the
 * target set score when the play has a point outcome, and increments player
 * and team aggregates. Stat definitions come from the global tracker config.
 *
 * Normal path: caller holds the team lock and writes to the current set of an
 * IN_PROGRESS match. Locked path (finished set or completed match): requires
 * an active passcode-issued editUnlock on the match; derived set/match
 * results are recomputed so standings stay consistent.
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
  const { teamKey, entries } = parsed.data;

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

  // Validate stat keys + player requirements against the live config.
  for (const entry of entries) {
    const stat = statsByKey.get(entry.statKey);
    if (!stat || !stat.enabled) {
      return NextResponse.json({ error: `Unknown statKey: ${entry.statKey}` }, { status: 400 });
    }
    if (stat.requiresPlayer && !entry.playerId) {
      return NextResponse.json({ error: `${stat.label} requires a player` }, { status: 400 });
    }
    if (!stat.requiresPlayer && entry.playerId) {
      return NextResponse.json(
        { error: `${stat.label} is a team stat and cannot have a player` },
        { status: 400 }
      );
    }
  }

  let pointTo: "A" | "B" | null;
  try {
    pointTo = derivePointToFromConfig(entries.map((e) => e.statKey), teamKey, statsByKey);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid play" }, { status: 400 });
  }

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
        // Locked set / completed match: only a passcode-issued unlock allows this.
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
        // Normal live capture requires holding the team lock.
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

      // Validate players belong to the tracked team.
      const trackedTeamId = teamKey === "A" ? match.teamAId : match.teamBId;
      const playerIds = [...new Set(entries.map((e) => e.playerId).filter(Boolean))] as string[];
      const playerSnaps = await Promise.all(
        playerIds.map((pid) => t.get(tournamentRef.collection("players").doc(pid)))
      );
      const playersById = new Map<string, any>();
      for (const snap of playerSnaps) {
        if (!snap.exists) return { status: 400 as const, error: "Unknown player in play" };
        const p = snap.data() as any;
        if (p.teamId !== trackedTeamId) {
          return { status: 400 as const, error: "Player is not on the tracked team" };
        }
        playersById.set(snap.id, p);
      }

      const seq = (match.playSeq ?? 0) + 1;
      const oldSetScores: { a: number; b: number }[] =
        Array.isArray(match.setScores) && match.setScores.length > 0
          ? match.setScores.map((s: any) => ({ a: s?.a ?? 0, b: s?.b ?? 0 }))
          : [{ a: 0, b: 0 }];
      const setScores = oldSetScores.map((s) => ({ ...s }));

      // Apply point outcome to the target set.
      if (pointTo) {
        const idx = Math.min(targetSet - 1, setScores.length - 1);
        if (pointTo === "A") setScores[idx].a += 1;
        else setScores[idx].b += 1;
      }

      const playRef = matchRef.collection("plays").doc();
      t.set(playRef, {
        seq,
        teamKey,
        setNumber: targetSet,
        entries,
        pointTo,
        recordedBy: user.uid,
        createdAt: now,
        deleted: false,
      });

      const matchUpdates: Record<string, unknown> = {
        playSeq: seq,
        setScores,
        lastPlayAt: now,
      };

      // Editing a finished set can flip its winner; keep derived fields consistent.
      if (editingLockedScope && pointTo) {
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

      // Player aggregates (set+merge with increments — no reads required).
      for (const entry of entries) {
        if (!entry.playerId) continue;
        const stat = statsByKey.get(entry.statKey)!;
        const player = playersById.get(entry.playerId);
        const increments: Record<string, unknown> = {
          [stat.aggregateField]: FieldValue.increment(1),
        };
        if (stat.category === "positive_scoring") {
          increments.pointsScored = FieldValue.increment(1);
        }
        t.set(
          tournamentRef.collection("playerStats").doc(entry.playerId),
          {
            playerId: entry.playerId,
            teamId: player?.teamId ?? null,
            displayName: player?.displayName ?? null,
            ...increments,
          },
          { merge: true }
        );
      }

      // Team points-for/against accumulate live for standings.
      if (pointTo) {
        const scoringTeamId = pointTo === "A" ? match.teamAId : match.teamBId;
        const concedingTeamId = pointTo === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(scoringTeamId),
          { teamId: scoringTeamId, pointsFor: FieldValue.increment(1) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(concedingTeamId),
          { teamId: concedingTeamId, pointsAgainst: FieldValue.increment(1) },
          { merge: true }
        );
      }

      return {
        status: 200 as const,
        playId: playRef.id,
        seq,
        pointTo,
        setScores,
      };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const targetSet = parsed.data.setNumber ?? (await matchRef.get()).data()?.currentSet ?? 1;
    for (const entry of entries) {
      const stat = statsByKey.get(entry.statKey);
      let playerName: string | null = null;
      if (entry.playerId) {
        const playerSnap = await tournamentRef.collection("players").doc(entry.playerId).get();
        playerName = String((playerSnap.data() as { displayName?: string })?.displayName ?? "");
      }
      void logTrackerMatchAction(adminDb, user, tournamentId, matchId, teamKey, "play_record", {
        setNumber: targetSet,
        statKey: entry.statKey,
        statLabel: stat?.label ?? entry.statKey,
        playerId: entry.playerId,
        playerName,
        details: {
          playId: result.playId,
          seq: result.seq,
          pointTo: result.pointTo,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Submit play failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
