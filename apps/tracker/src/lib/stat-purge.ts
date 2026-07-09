import { Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getStatTracker } from "@bsc/shared";
import { rebuildTournamentAggregates } from "./tournament-stats-rebuild";

export type StatImpact = {
  statKey: string;
  playCount: number;
  tournamentCount: number;
  matchCount: number;
  playerCount: number;
};

function sportFromTrackerId(statTrackerId: string): string {
  try {
    return getStatTracker(statTrackerId).sport;
  } catch {
    return statTrackerId.split(".")[0] || "volleyball";
  }
}

function playContainsStat(
  play: { entries?: { statKey: string; playerId?: string | null }[]; deleted?: boolean },
  statKey: string
): boolean {
  if (play.deleted) return false;
  return (play.entries ?? []).some((e) => e.statKey === statKey);
}

async function tournamentsForSport(adminDb: Firestore, sport: string) {
  const snap = await adminDb.collection("tournaments").get();
  return snap.docs.filter((doc) => {
    const statTrackerId = String(
      (doc.data() as { statTrackerId?: string }).statTrackerId ?? "volleyball.v1"
    );
    return sportFromTrackerId(statTrackerId) === sport;
  });
}

/** Count non-deleted plays that reference a statKey across all tournaments for a sport. */
export async function getStatImpact(
  adminDb: Firestore,
  sport: string,
  statKey: string
): Promise<StatImpact> {
  const tournamentIds = new Set<string>();
  const matchIds = new Set<string>();
  const playerIds = new Set<string>();
  let playCount = 0;

  for (const tDoc of await tournamentsForSport(adminDb, sport)) {
    const matchesSnap = await tDoc.ref.collection("matches").get();
    for (const mDoc of matchesSnap.docs) {
      const playsSnap = await mDoc.ref.collection("plays").get();
      let matchHit = false;
      for (const pDoc of playsSnap.docs) {
        const data = pDoc.data();
        if (!playContainsStat(data, statKey)) continue;
        playCount += 1;
        matchHit = true;
        tournamentIds.add(tDoc.id);
        for (const entry of data.entries ?? []) {
          if (entry.statKey === statKey && entry.playerId) {
            playerIds.add(entry.playerId);
          }
        }
      }
      if (matchHit) matchIds.add(mDoc.id);
    }
  }

  return {
    statKey,
    playCount,
    tournamentCount: tournamentIds.size,
    matchCount: matchIds.size,
    playerCount: playerIds.size,
  };
}

async function commitBatchedUpdates(
  adminDb: Firestore,
  refs: DocumentReference[],
  data: Record<string, unknown>
): Promise<void> {
  let batch = adminDb.batch();
  let ops = 0;
  for (const ref of refs) {
    batch.update(ref, data);
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

/**
 * Soft-delete every play that recorded the stat, rebuild tournament aggregates,
 * and disable the stat in tracker config.
 */
export async function purgeStatFromSport(
  adminDb: Firestore,
  sport: string,
  statKey: string,
  deletedBy: string
): Promise<{ playsPurged: number; tournamentsRebuilt: number }> {
  const now = Timestamp.now();
  const affectedTournaments = new Set<string>();
  const playRefs: DocumentReference[] = [];

  for (const tDoc of await tournamentsForSport(adminDb, sport)) {
    const matchesSnap = await tDoc.ref.collection("matches").get();
    for (const mDoc of matchesSnap.docs) {
      const playsSnap = await mDoc.ref.collection("plays").get();
      for (const pDoc of playsSnap.docs) {
        if (!playContainsStat(pDoc.data(), statKey)) continue;
        playRefs.push(pDoc.ref);
        affectedTournaments.add(tDoc.id);
      }
    }
  }

  if (playRefs.length > 0) {
    await commitBatchedUpdates(adminDb, playRefs, {
      deleted: true,
      deletedBy,
      deletedAt: now,
    });
  }

  for (const tournamentId of affectedTournaments) {
    await rebuildTournamentAggregates(adminDb, tournamentId);
  }

  const configRef = adminDb.collection("trackerConfigs").doc(sport);
  const configSnap = await configRef.get();
  const stats = (configSnap.data() as { stats?: { key: string; enabled?: boolean }[] } | undefined)
    ?.stats;
  if (Array.isArray(stats)) {
    const nextStats = stats.map((s) =>
      s.key === statKey ? { ...s, enabled: false } : s
    );
    await configRef.set(
      {
        stats: nextStats,
        updatedAt: now.toDate().toISOString(),
        updatedBy: deletedBy,
      },
      { merge: true }
    );
  }

  return {
    playsPurged: playRefs.length,
    tournamentsRebuilt: affectedTournaments.size,
  };
}
