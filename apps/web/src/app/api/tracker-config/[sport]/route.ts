import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  TrackerConfigSchema,
  normalizeTrackerConfig,
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
  const { config, changed } = normalizeTrackerConfig(parsed);
  if (changed) {
    await ref.set(
      {
        stats: config.stats,
        colors: config.colors,
        updatedAt: Timestamp.now().toDate().toISOString(),
      },
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
