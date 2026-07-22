import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  getTeamDeleteBlockersFromContext,
  loadTournamentDeleteContext,
} from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; teamId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, teamId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updates.name = name;
  }
  if (body.color !== undefined) updates.color = body.color ?? null;
  if (body.divisionId !== undefined) {
    const divisionId = body.divisionId ? String(body.divisionId) : null;
    if (divisionId) {
      const division = await adminDb
        .collection("tournaments")
        .doc(tournamentId)
        .collection("divisions")
        .doc(divisionId)
        .get();
      if (!division.exists) {
        return NextResponse.json({ error: "Division not found" }, { status: 404 });
      }
    }
    updates.divisionId = divisionId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("teams")
    .doc(teamId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; teamId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, teamId } = await params;
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const teamRef = tournamentRef.collection("teams").doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const ctx = await loadTournamentDeleteContext(adminDb, tournamentId);
  const blockers = getTeamDeleteBlockersFromContext(ctx, teamId);
  if (blockers.length) {
    return NextResponse.json(
      { error: "Cannot delete team", blockers },
      { status: 409 }
    );
  }

  // Unassign players on this team.
  const playersSnap = await tournamentRef
    .collection("players")
    .where("teamId", "==", teamId)
    .get();
  const batch = adminDb.batch();
  playersSnap.docs.forEach((d) => batch.update(d.ref, { teamId: null }));
  batch.delete(tournamentRef.collection("teams").doc(teamId));
  await batch.commit();

  return NextResponse.json({ ok: true });
}
