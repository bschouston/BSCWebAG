import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId)
    .get();
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  return NextResponse.json({ match: { id: snap.id, ...snap.data() } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const updates: Record<string, unknown> = {};
  if (body.teamAId !== undefined) updates.teamAId = String(body.teamAId);
  if (body.teamBId !== undefined) updates.teamBId = String(body.teamBId);
  if (body.scheduledAt !== undefined) {
    updates.scheduledAt = body.scheduledAt
      ? Timestamp.fromDate(new Date(body.scheduledAt))
      : null;
  }
  if (body.status !== undefined) {
    if (!["UPCOMING", "IN_PROGRESS", "COMPLETED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId);

  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const match = snap.data() as any;
  if ((match?.playSeq ?? 0) > 0) {
    return NextResponse.json(
      { error: "Match has recorded plays; it cannot be deleted" },
      { status: 409 }
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
