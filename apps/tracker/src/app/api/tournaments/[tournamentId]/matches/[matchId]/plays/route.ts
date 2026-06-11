import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  SubmitPlayInputSchema,
  derivePointTo,
  getStatKeyDefinition,
  isValidStatKey,
} from "@bsc/shared";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Submit a play: one transaction that appends the play document, bumps the
 * live set score when the play has a point outcome, and increments player and
 * team aggregates. The caller must hold the active lock for the team.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { tournamentId, matchId } = await params;
  const adminDb = getAdminDb();

  const parsed = SubmitPlayInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { teamKey, entries } = parsed.data;

  // Validate stat keys + player requirements before touching Firestore.
  for (const entry of entries) {
    if (!isValidStatKey(entry.statKey)) {
      return NextResponse.json({ error: `Unknown statKey: ${entry.statKey}` }, { status: 400 });
    }
    const def = getStatKeyDefinition(entry.statKey);
    if (def.requiresPlayer && !entry.playerId) {
      return NextResponse.json(
        { error: `${entry.statKey} requires a player` },
        { status: 400 }
      );
    }
    if (!def.requiresPlayer && entry.playerId) {
      return NextResponse.json(
        { error: `${entry.statKey} is a team stat and cannot have a player` },
        { status: 400 }
      );
    }
  }

  let pointTo: "A" | "B" | null;
  try {
    pointTo = derivePointTo(entries.map((e) => e.statKey), teamKey);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid play" }, { status: 400 });
  }

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const lockRef = tournamentRef.collection("locks").doc(`${matchId}_${teamKey}`);
  const now = Timestamp.now();

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [lockSnap, matchSnap] = await Promise.all([t.get(lockRef), t.get(matchRef)]);

      // Lock ownership check.
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
      if (match.status !== "IN_PROGRESS") {
        return { status: 409 as const, error: "Match is not in progress" };
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
      const currentSet = match.currentSet ?? 1;
      const setScores: { a: number; b: number }[] =
        Array.isArray(match.setScores) && match.setScores.length > 0
          ? match.setScores.map((s: any) => ({ a: s?.a ?? 0, b: s?.b ?? 0 }))
          : [{ a: 0, b: 0 }];

      // Apply point outcome to the live set.
      if (pointTo) {
        const idx = Math.min(currentSet - 1, setScores.length - 1);
        if (pointTo === "A") setScores[idx].a += 1;
        else setScores[idx].b += 1;
      }

      const playRef = matchRef.collection("plays").doc();
      t.set(playRef, {
        seq,
        teamKey,
        setNumber: currentSet,
        entries,
        pointTo,
        recordedBy: user.uid,
        createdAt: now,
        deleted: false,
      });

      t.update(matchRef, {
        playSeq: seq,
        setScores,
        lastPlayAt: now,
      });

      // Player aggregates (set+merge with increments — no reads required).
      for (const entry of entries) {
        if (!entry.playerId) continue;
        const def = getStatKeyDefinition(entry.statKey);
        const player = playersById.get(entry.playerId);
        const statsRef = tournamentRef.collection("playerStats").doc(entry.playerId);
        const increments: Record<string, unknown> = {
          [def.aggregateField]: FieldValue.increment(1),
        };
        if (def.outcome === "point_for") {
          increments.pointsScored = FieldValue.increment(1);
        }
        t.set(
          statsRef,
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
    return NextResponse.json(result);
  } catch (err) {
    console.error("Submit play failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
