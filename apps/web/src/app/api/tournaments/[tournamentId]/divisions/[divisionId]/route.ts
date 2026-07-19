import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ tournamentId: string; divisionId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId, divisionId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    color?: unknown;
  };
  const updates: Record<string, string> = {};
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.color !== undefined) {
    const color = String(body.color ?? "");
    if (!COLOR_PATTERN.test(color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    updates.color = color;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const ref = getAdminDb()
    .collection("tournaments")
    .doc(tournamentId)
    .collection("divisions")
    .doc(divisionId);
  if (!(await ref.get()).exists) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ tournamentId: string; divisionId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId, divisionId } = await params;
  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const ref = tournamentRef.collection("divisions").doc(divisionId);
  if (!(await ref.get()).exists) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }

  // Keep teams intact when a division is removed; only clear their assignment.
  const teams = await tournamentRef
    .collection("teams")
    .where("divisionId", "==", divisionId)
    .get();
  const batch = adminDb.batch();
  teams.docs.forEach((team) => batch.update(team.ref, { divisionId: null }));
  batch.delete(ref);
  await batch.commit();
  return NextResponse.json({ ok: true });
}
