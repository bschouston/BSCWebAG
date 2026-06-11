import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** Admin force-release of tracker locks for a match (e.g. crashed tablet). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const now = Timestamp.now();

  const locksRef = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("locks");

  const batch = adminDb.batch();
  let released = 0;
  for (const teamKey of ["A", "B"] as const) {
    const lockRef = locksRef.doc(`${matchId}_${teamKey}`);
    const snap = await lockRef.get();
    if (snap.exists && !(snap.data() as any)?.releasedAt) {
      batch.update(lockRef, { releasedAt: now, releasedBy: user.uid, forced: true });
      released += 1;
    }
  }
  if (released > 0) await batch.commit();

  return NextResponse.json({ ok: true, released });
}
