import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("teams")
    .orderBy("createdAt", "desc")
    .get();

  return NextResponse.json({
    teams: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const body = (await req.json()) as any;
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const divisionId = body?.divisionId ? String(body.divisionId) : null;
  if (divisionId) {
    const division = await tournamentRef.collection("divisions").doc(divisionId).get();
    if (!division.exists) {
      return NextResponse.json({ error: "Division not found" }, { status: 404 });
    }
  }

  const ref = tournamentRef.collection("teams").doc();

  await ref.set({
    name,
    color: body?.color ?? null,
    divisionId,
    createdAt: Timestamp.now(),
  });

  return NextResponse.json({ id: ref.id });
}

