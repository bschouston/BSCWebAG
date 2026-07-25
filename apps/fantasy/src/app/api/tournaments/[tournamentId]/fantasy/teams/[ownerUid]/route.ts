import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  defaultFantasyConfig,
  fantasyTeamNameLower,
  normalizeFantasyTeamName,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Admin override edit / lock for a specific fantasy team. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; ownerUid: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId, ownerUid } = await params;
  const adminDb = getAdminDb();
  const body = (await req.json().catch(() => ({}))) as {
    teamName?: string;
    photoUrl?: string | null;
    playerIds?: string[];
    locked?: boolean;
  };

  const teamRef = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("fantasyTeams")
    .doc(ownerUid);
  const snap = await teamRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  const existing = snap.data() as Record<string, unknown>;
  const patch: Record<string, unknown> = {
    updatedAt: Timestamp.now().toDate().toISOString(),
  };

  if (typeof body.locked === "boolean") {
    patch.locked = body.locked;
  }
  if (body.teamName !== undefined) {
    const teamName = normalizeFantasyTeamName(body.teamName);
    if (!teamName) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }
    const nameLower = fantasyTeamNameLower(teamName);
    const dup = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("fantasyTeams")
      .where("teamNameLower", "==", nameLower)
      .limit(5)
      .get();
    if (dup.docs.some((d) => d.id !== ownerUid)) {
      return NextResponse.json(
        { error: "That team name is already taken in this tournament" },
        { status: 400 }
      );
    }
    patch.teamName = teamName;
    patch.teamNameLower = nameLower;
  }
  if (body.photoUrl !== undefined) patch.photoUrl = body.photoUrl;
  if (Array.isArray(body.playerIds)) {
    const configSnap = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("fantasy")
      .doc("config")
      .get();
    const config = configSnap.exists
      ? { ...defaultFantasyConfig(), ...(configSnap.data() as object) }
      : defaultFantasyConfig();
    const playerIds = [...new Set(body.playerIds.map(String))];
    if (playerIds.length > Number(config.teamSize ?? 7)) {
      return NextResponse.json({ error: "Roster exceeds team size" }, { status: 400 });
    }
    patch.playerIds = playerIds;
  }

  await teamRef.set(patch, { merge: true });
  const saved = (await teamRef.get()).data() as Record<string, unknown>;
  return NextResponse.json({ team: { id: ownerUid, ...saved } });
}

/** Admin hard-delete for a specific fantasy team. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; ownerUid: string }> }
) {
  const auth = await requireFantasyAdmin(req);
  if (auth.error) return auth.error;
  const { tournamentId, ownerUid } = await params;
  const teamRef = getAdminDb()
    .collection("tournaments")
    .doc(tournamentId)
    .collection("fantasyTeams")
    .doc(ownerUid);
  const snap = await teamRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  await teamRef.delete();
  return NextResponse.json({ ok: true, id: ownerUid });
}
