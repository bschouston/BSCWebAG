import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  TrackerConfigSchema,
  applyManualScoringPolicy,
  isKnownSport as isBuiltInSport,
  tryGetContainerModule,
  type TrackerConfig,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

async function isKnownSport(sport: string): Promise<boolean> {
  if (isBuiltInSport(sport)) return true;
  const snap = await getAdminDb()
    .collection("sportTrackers")
    .where("sport", "==", sport)
    .limit(1)
    .get();
  return !snap.empty;
}

async function getOrSeedConfig(sport: string): Promise<TrackerConfig> {
  const ref = getAdminDb().collection("trackerConfigs").doc(sport);
  const snap = await ref.get();
  if (!snap.exists) {
    const bySport = await getAdminDb()
      .collection("sportTrackers")
      .where("sport", "==", sport)
      .limit(1)
      .get();
    const containerType =
      (bySport.docs[0]?.data() as { containerType?: string } | undefined)?.containerType ??
      (isBuiltInSport(sport) ? sport : null);
    if (!containerType) throw new Error(`No tracker config for sport: ${sport}`);
    const module = tryGetContainerModule(containerType);
    if (!module?.canAutoSeed) throw new Error(`No tracker config for sport: ${sport}`);
    const seeded = { ...module.defaultConfig(), sport };
    await ref.set({ ...seeded, updatedAt: Timestamp.now().toDate().toISOString() });
    return seeded;
  }
  const parsed = TrackerConfigSchema.parse(snap.data());
  const { config, changed } = applyManualScoringPolicy(parsed);
  if (changed) {
    await ref.set(
      { stats: config.stats, updatedAt: Timestamp.now().toDate().toISOString() },
      { merge: true }
    );
  }
  return config;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { sport } = await params;
  if (!(await isKnownSport(sport))) {
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
  if (!(await isKnownSport(sport))) {
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
