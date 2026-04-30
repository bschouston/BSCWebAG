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
    .collection("players")
    .orderBy("createdAt", "desc")
    .get();

  return NextResponse.json({
    players: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
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
  const displayName = String(body?.displayName ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("players")
    .doc();

  await ref.set({
    displayName,
    number: body?.number ?? null,
    teamId: body?.teamId ?? null,
    createdAt: Timestamp.now(),
  });

  return NextResponse.json({ id: ref.id });
}

