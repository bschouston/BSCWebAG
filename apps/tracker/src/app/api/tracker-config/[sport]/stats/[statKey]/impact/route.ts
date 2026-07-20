import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTrackerAdmin } from "../../../../../../../lib/server-auth";
import { getOrSeedTrackerConfig, isKnownSport } from "../../../../../../../lib/tracker-config-server";
import { getStatImpact } from "../../../../../../../lib/stat-purge";

export const dynamic = "force-dynamic";

/** How many plays/tournaments reference a stat before it can be purged. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sport: string; statKey: string }> }
) {
  const { error } = await requireTrackerAdmin(req);
  if (error) return error;

  const { sport, statKey } = await params;
  if (!(await isKnownSport(sport))) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const config = await getOrSeedTrackerConfig(sport);
    const stat = config.stats.find((s) => s.key === statKey);
    if (!stat) {
      return NextResponse.json({ error: "Stat not found" }, { status: 404 });
    }

    const impact = await getStatImpact(getAdminDb(), sport, statKey);
    return NextResponse.json({
      ...impact,
      label: stat.label,
      shortLabel: stat.shortLabel,
    });
  } catch (err) {
    console.error("Stat impact check failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
