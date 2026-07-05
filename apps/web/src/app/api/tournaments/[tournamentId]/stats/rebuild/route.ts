import { NextRequest, NextResponse } from "next/server";
import {
  aggregatePlayerStatsFromPlays,
  getStatTracker,
  type TrackerStat,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

const STAT_COUNTER_FIELDS = new Set([
  "aces",
  "serveErrors",
  "receives",
  "receiveErrors",
  "assists",
  "attempts",
  "kills",
  "attackErrors",
  "blocks",
  "digs",
  "pointsScored",
  "opponentErrors",
]);

function sportFromTrackerId(statTrackerId: string): string {
  try {
    return getStatTracker(statTrackerId).sport;
  } catch {
    return statTrackerId.split(".")[0] || "volleyball";
  }
}

/** Rebuild playerStats counters from all non-deleted plays in the tournament. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const statTrackerId = String((tournamentSnap.data() as any)?.statTrackerId ?? "volleyball.v1");
  const sport = sportFromTrackerId(statTrackerId);

  const configSnap = await adminDb.collection("trackerConfigs").doc(sport).get();
  const stats = (configSnap.data() as any)?.stats as TrackerStat[] | undefined;
  if (!stats?.length) {
    return NextResponse.json({ error: "Tracker config not found" }, { status: 404 });
  }

  const statsByKey = new Map(stats.map((s) => [s.key, s]));
  const aggregateFields = new Set(stats.map((s) => s.aggregateField));

  const [playersSnap, matchesSnap, existingStatsSnap] = await Promise.all([
    tournamentRef.collection("players").get(),
    tournamentRef.collection("matches").get(),
    tournamentRef.collection("playerStats").get(),
  ]);

  const playersById = new Map(
    playersSnap.docs.map((d) => {
      const data = d.data() as any;
      return [d.id, { teamId: data.teamId, displayName: data.displayName }];
    })
  );

  const allPlays: { entries: { playerId: string | null; statKey: string }[]; deleted?: boolean }[] =
    [];
  for (const matchDoc of matchesSnap.docs) {
    const playsSnap = await matchDoc.ref.collection("plays").get();
    for (const playDoc of playsSnap.docs) {
      const data = playDoc.data() as any;
      allPlays.push({ entries: data.entries ?? [], deleted: data.deleted });
    }
  }

  const recomputed = aggregatePlayerStatsFromPlays(allPlays, statsByKey, playersById);

  const batch = adminDb.batch();
  let updated = 0;

  for (const playerDoc of playersSnap.docs) {
    const playerId = playerDoc.id;
    const player = playerDoc.data() as any;
    const existing = existingStatsSnap.docs.find((d) => d.id === playerId)?.data() as
      | Record<string, unknown>
      | undefined;
    const counts = recomputed.get(playerId) ?? {};

    const next: Record<string, unknown> = {
      playerId,
      teamId: player.teamId ?? null,
      displayName: player.displayName ?? null,
    };

    // Preserve non-counter metadata (e.g. matchesPlayed).
    if (existing) {
      for (const [field, value] of Object.entries(existing)) {
        if (
          field === "playerId" ||
          field === "teamId" ||
          field === "displayName" ||
          STAT_COUNTER_FIELDS.has(field) ||
          aggregateFields.has(field)
        ) {
          continue;
        }
        next[field] = value;
      }
    }

    // Reset known counter fields, then apply recomputed totals.
    for (const field of aggregateFields) next[field] = 0;
    next.pointsScored = 0;

    for (const [field, value] of Object.entries(counts)) {
      next[field] = value;
    }

    batch.set(tournamentRef.collection("playerStats").doc(playerId), next, { merge: true });
    updated += 1;
  }

  await batch.commit();

  return NextResponse.json({
    ok: true,
    playersUpdated: updated,
    playsScanned: allPlays.filter((p) => !p.deleted).length,
  });
}
