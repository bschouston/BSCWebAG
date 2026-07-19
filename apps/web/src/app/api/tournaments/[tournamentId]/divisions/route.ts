import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("divisions")
    .orderBy("createdAt", "asc")
    .get();

  return NextResponse.json({
    divisions: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    color?: unknown;
  };
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const color = String(body.color ?? "#1a3556");
  if (!COLOR_PATTERN.test(color)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }

  const tournamentRef = getAdminDb().collection("tournaments").doc(tournamentId);
  if (!(await tournamentRef.get()).exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const ref = tournamentRef.collection("divisions").doc();
  await ref.set({ name, color, createdAt: Timestamp.now() });

  return NextResponse.json({ id: ref.id });
}
