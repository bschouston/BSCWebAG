import { NextRequest, NextResponse } from "next/server";
import { defaultFantasyConfig, isFantasyTeamEffectivelyLocked } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * List all fantasy teams in a tournament so players can browse each other's
 * rosters. ownerEmail is never returned.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const adminDb = getAdminDb();

  const [teamsSnap, configSnap] = await Promise.all([
    adminDb.collection("tournaments").doc(tournamentId).collection("fantasyTeams").get(),
    adminDb.collection("tournaments").doc(tournamentId).collection("fantasy").doc("config").get(),
  ]);
  const config = configSnap.exists
    ? { ...defaultFantasyConfig(), ...(configSnap.data() as object) }
    : defaultFantasyConfig();

  const teams = teamsSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const { ownerEmail: _e, ...safe } = data;
    return {
      id: d.id,
      ...safe,
      isMine: d.id === auth.user.uid,
      effectivelyLocked: isFantasyTeamEffectivelyLocked(
        { locked: data.locked === true },
        config
      ),
    };
  });

  return NextResponse.json({ teams, config });
}
