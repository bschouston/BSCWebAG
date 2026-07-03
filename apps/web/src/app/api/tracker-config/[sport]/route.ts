import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  TrackerConfigSchema,
  defaultVolleyballTrackerConfig,
  statTrackers,
  type TrackerConfig,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

function isKnownSport(sport: string): boolean {
  return statTrackers.some((t) => t.sport === sport);
}

async function getOrSeedConfig(sport: string): Promise<TrackerConfig> {
  const ref = getAdminDb().collection("trackerConfigs").doc(sport);
  const snap = await ref.get();
  if (snap.exists) return TrackerConfigSchema.parse(snap.data());
  if (sport !== "volleyball") throw new Error(`No tracker config for sport: ${sport}`);
  const seeded = defaultVolleyballTrackerConfig();
  await ref.set({ ...seeded, updatedAt: Timestamp.now().toDate().toISOString() });
  return seeded;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { sport } = await params;
  if (!isKnownSport(sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }
  try {
    const config = await getOrSeedConfig(sport);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("Tracker config read failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Admin edit of global leaderboard points from the web console. Full stat
 * management (add/edit/delete, colors, layout) lives in the tracker settings.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { sport } = await params;
  if (!isKnownSport(sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { points?: unknown };
  const points = body.points;
  if (
    !points ||
    typeof points !== "object" ||
    Array.isArray(points) ||
    Object.values(points).some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    return NextResponse.json(
      { error: "points must be a map of statKey to number" },
      { status: 400 }
    );
  }

  try {
    const config = await getOrSeedConfig(sport);
    const map = points as Record<string, number>;
    const stats = config.stats.map((s) =>
      s.key in map ? { ...s, points: map[s.key] } : s
    );
    await getAdminDb()
      .collection("trackerConfigs")
      .doc(sport)
      .set({ stats, updatedAt: Timestamp.now().toDate().toISOString() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Tracker config points update failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
