import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  VOLLEYBALL_STAT_KEYS,
  getStatTracker,
  type TrackerStat,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

type PlayEntry = { playerId: string | null; statKey: string };

type StatInfo = { aggregateField: string; scoring: boolean };

/** statKey -> aggregate info from the global tracker config (static fallback). */
async function loadStatInfo(
  adminDb: FirebaseFirestore.Firestore,
  statTrackerId: string
): Promise<Map<string, StatInfo>> {
  let sport = "volleyball";
  try {
    sport = getStatTracker(statTrackerId).sport;
  } catch {
    sport = statTrackerId.split(".")[0] || "volleyball";
  }
  const map = new Map<string, StatInfo>();
  for (const s of VOLLEYBALL_STAT_KEYS) {
    map.set(s.key, { aggregateField: s.aggregateField, scoring: false });
  }
  try {
    const snap = await adminDb.collection("trackerConfigs").doc(sport).get();
    const stats = (snap.data() as any)?.stats as TrackerStat[] | undefined;
    if (Array.isArray(stats)) {
      for (const s of stats) {
        map.set(s.key, {
          aggregateField: s.aggregateField,
          scoring: s.category === "positive_scoring",
        });
      }
    }
  } catch {
    // static fallback already populated
  }
  return map;
}

function aggregateDeltas(
  entries: PlayEntry[],
  direction: 1 | -1,
  statInfo: Map<string, StatInfo>
) {
  const byPlayer = new Map<string, Record<string, number>>();
  for (const entry of entries) {
    if (!entry?.playerId || !entry?.statKey) continue;
    const def = statInfo.get(entry.statKey);
    if (!def) continue;
    const deltas = byPlayer.get(entry.playerId) ?? {};
    deltas[def.aggregateField] = (deltas[def.aggregateField] ?? 0) + direction;
    if (def.scoring) {
      deltas.pointsScored = (deltas.pointsScored ?? 0) + direction;
    }
    byPlayer.set(entry.playerId, deltas);
  }
  return byPlayer;
}

/**
 * Admin correction for a recorded play: action "delete" or "undelete".
 * Reverses or re-applies player aggregates and team points transactionally.
 * Set scores are only adjusted when the play belongs to the match's current
 * in-progress set; finished sets / completed matches need manual review.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string; playId: string }> }
) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId, playId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;
  const action = String(body?.action ?? "");
  if (action !== "delete" && action !== "undelete") {
    return NextResponse.json({ error: "action must be delete or undelete" }, { status: 400 });
  }

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);
  const playRef = matchRef.collection("plays").doc(playId);
  const now = Timestamp.now();

  const tournamentSnap = await tournamentRef.get();
  const statInfo = await loadStatInfo(
    adminDb,
    String((tournamentSnap.data() as any)?.statTrackerId ?? "volleyball.v1")
  );

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const [playSnap, matchSnap] = await Promise.all([t.get(playRef), t.get(matchRef)]);
      if (!playSnap.exists) return { status: 404 as const, error: "Play not found" };
      if (!matchSnap.exists) return { status: 404 as const, error: "Match not found" };

      const play = playSnap.data() as any;
      const match = matchSnap.data() as any;

      if (action === "delete" && play.deleted) {
        return { status: 409 as const, error: "Play is already deleted" };
      }
      if (action === "undelete" && !play.deleted) {
        return { status: 409 as const, error: "Play is not deleted" };
      }

      const direction: 1 | -1 = action === "delete" ? -1 : 1;

      // Score adjustment only for the live set of an in-progress match.
      let scoreAdjusted = false;
      if (
        play.pointTo &&
        match.status === "IN_PROGRESS" &&
        play.setNumber === (match.currentSet ?? 1)
      ) {
        const setScores: { a: number; b: number }[] = (match.setScores ?? []).map((s: any) => ({
          a: s?.a ?? 0,
          b: s?.b ?? 0,
        }));
        const idx = Math.min((match.currentSet ?? 1) - 1, setScores.length - 1);
        if (idx >= 0) {
          const side = play.pointTo === "A" ? "a" : "b";
          setScores[idx][side] = Math.max(0, setScores[idx][side] + direction);
          t.update(matchRef, { setScores });
          scoreAdjusted = true;
        }
      }

      t.update(playRef, {
        deleted: action === "delete",
        deletedBy: action === "delete" ? user.uid : null,
        deletedAt: action === "delete" ? now : null,
      });

      for (const [playerId, deltas] of aggregateDeltas(play.entries ?? [], direction, statInfo)) {
        const increments = Object.fromEntries(
          Object.entries(deltas).map(([field, delta]) => [field, FieldValue.increment(delta)])
        );
        t.set(tournamentRef.collection("playerStats").doc(playerId), increments, { merge: true });
      }

      if (play.pointTo) {
        const scoringTeamId = play.pointTo === "A" ? match.teamAId : match.teamBId;
        const concedingTeamId = play.pointTo === "A" ? match.teamBId : match.teamAId;
        t.set(
          tournamentRef.collection("teamStats").doc(scoringTeamId),
          { pointsFor: FieldValue.increment(direction) },
          { merge: true }
        );
        t.set(
          tournamentRef.collection("teamStats").doc(concedingTeamId),
          { pointsAgainst: FieldValue.increment(direction) },
          { merge: true }
        );
      }

      return { status: 200 as const, scoreAdjusted };
    });

    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      scoreAdjusted: result.scoreAdjusted,
      note: result.scoreAdjusted
        ? undefined
        : "Aggregates updated. Set scores were not changed because the play is not in the live set.",
    });
  } catch (err) {
    console.error("Play correction failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
