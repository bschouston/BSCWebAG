import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";
import { getOrSeedTrackerConfig, isKnownSport } from "../../../../../../../lib/tracker-config-server";
import { purgeStatFromSport } from "../../../../../../../lib/stat-purge";

export const dynamic = "force-dynamic";

/**
 * Soft-delete all plays that recorded this stat, rebuild aggregates and
 * leaderboards, then disable the stat in tracker config.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string; statKey: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { sport, statKey } = await params;
  if (!isKnownSport(sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const config = await getOrSeedTrackerConfig(sport);
    const stat = config.stats.find((s) => s.key === statKey);
    if (!stat) {
      return NextResponse.json({ error: "Stat not found" }, { status: 404 });
    }

    const result = await purgeStatFromSport(getAdminDb(), sport, statKey, user.uid);
    const nextConfig = await getOrSeedTrackerConfig(sport);

    return NextResponse.json({
      ok: true,
      ...result,
      config: nextConfig,
    });
  } catch (err) {
    console.error("Stat purge failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
