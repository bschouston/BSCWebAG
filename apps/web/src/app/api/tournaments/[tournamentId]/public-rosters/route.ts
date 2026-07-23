import { NextRequest, NextResponse } from "next/server";
import {
  buildPublicRosterPlayers,
  getAdminDb,
  getPublicLiveTournament,
  toPublicRosterResponsePlayer,
} from "@/lib/public-roster";

export const dynamic = "force-dynamic";

/**
 * All assigned public rosters for a live tournament (Teams tab).
 * Resolves headshots and profile fields from event registrations.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId } = await params;

  const live = await getPublicLiveTournament(adminDb, tournamentId);
  if (!live) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const players = await buildPublicRosterPlayers({
    adminDb,
    tournamentRef: live.ref,
    tournament: live.data,
  });

  const byTeam = new Map<string, typeof players>();
  for (const player of players) {
    if (!player.teamId) continue;
    const list = byTeam.get(player.teamId) ?? [];
    list.push(player);
    byTeam.set(player.teamId, list);
  }

  return NextResponse.json({
    teams: [...byTeam.entries()].map(([teamId, roster]) => ({
      teamId,
      players: roster.map(toPublicRosterResponsePlayer),
    })),
  });
}
