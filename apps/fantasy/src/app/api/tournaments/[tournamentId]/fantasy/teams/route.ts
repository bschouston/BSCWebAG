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

/** Lock or unlock every fantasy team, including the global lock. */
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
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const teamsRef = tournamentRef.collection("fantasyTeams");
  const configRef = tournamentRef.collection("fantasy").doc("config");
  const teamsSnap = await teamsRef.get();
  const now = Timestamp.now().toDate().toISOString();

  // Leave room for the config write under Firestore's 500-write batch limit.
  const chunks: typeof teamsSnap.docs[] = [];
  for (let i = 0; i < teamsSnap.docs.length; i += 499) {
    chunks.push(teamsSnap.docs.slice(i, i + 499));
  }
  if (chunks.length === 0) chunks.push([]);

  for (let i = 0; i < chunks.length; i += 1) {
    const batch = adminDb.batch();
    for (const teamDoc of chunks[i]) {
      batch.set(teamDoc.ref, { locked: body.locked, updatedAt: now }, { merge: true });
    }
    if (i === 0) {
      batch.set(
        configRef,
        {
          teamsLockedGlobal: body.locked,
          updatedAt: now,
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return NextResponse.json({
    locked: body.locked,
    updatedTeams: teamsSnap.size,
  });
}
