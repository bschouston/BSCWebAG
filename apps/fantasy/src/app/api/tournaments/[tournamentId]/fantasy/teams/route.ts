import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { defaultFantasyConfig, isFantasyTeamEffectivelyLocked } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyAdmin, requireFantasyUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * List all fantasy teams in a tournament so players can browse each other's
 * rosters. Owner email is returned only to Fantasy admins.
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
      ...(auth.user.isFantasyAdmin
        ? { ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : null }
        : {}),
      isMine: d.id === auth.user.uid,
      effectivelyLocked: isFantasyTeamEffectivelyLocked(
        { locked: data.locked === true },
        config
      ),
    };
  });

  return NextResponse.json({ teams, config });
}

/** Toggle the global roster lock (applies to all teams, including ones created later). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as { locked?: boolean };
  if (typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  const configRef = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("fantasy")
    .doc("config");
  const now = Timestamp.now().toDate().toISOString();

  await configRef.set(
    {
      teamsLockedGlobal: body.locked,
      updatedAt: now,
      updatedBy: auth.user.uid,
    },
    { merge: true }
  );

  return NextResponse.json({
    locked: body.locked,
    teamsLockedGlobal: body.locked,
  });
}
