import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

type LockPublic = {
  teamKey: "A" | "B";
  ownerUid: string;
  ownerName: string;
  expiresAt: string | null;
};

function isActiveLock(data: Record<string, unknown>, nowMs: number): boolean {
  if (data.releasedAt) return false;
  const expiresAt = data.expiresAt as Timestamp | undefined;
  if (!expiresAt?.toMillis) return false;
  return expiresAt.toMillis() > nowMs;
}

/** Active locks for a match (who is tracking each team). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireTracker(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const nowMs = Timestamp.now().toMillis();
  const locksRef = adminDb.collection("tournaments").doc(tournamentId).collection("locks");

  const locks: LockPublic[] = [];
  for (const teamKey of ["A", "B"] as const) {
    const snap = await locksRef.doc(`${matchId}_${teamKey}`).get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    if (!isActiveLock(data, nowMs)) continue;
    locks.push({
      teamKey,
      ownerUid: String(data.ownerUid ?? ""),
      ownerName: String(data.ownerName ?? "").trim() || "Unknown tracker",
      expiresAt:
        (data.expiresAt as Timestamp | undefined)?.toDate?.()?.toISOString?.() ?? null,
    });
  }

  return NextResponse.json({ locks });
}
