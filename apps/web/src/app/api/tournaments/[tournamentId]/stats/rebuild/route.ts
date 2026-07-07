import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { rebuildTournamentAggregates } from "@/lib/tournament-stats-rebuild";

export const dynamic = "force-dynamic";

/** Rebuild playerStats and teamStats from all non-deleted plays in the tournament. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const adminDb = getAdminDb();
    const { tournamentId } = await params;
    const result = await rebuildTournamentAggregates(adminDb, tournamentId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to rebuild stats";
    const status = message === "Tournament not found" || message === "Tracker config not found" ? 404 : 500;
    console.error("Rebuild stats error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
