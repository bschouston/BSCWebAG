import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

type LockPublic = {
  matchId: string;
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

/** Active tracker locks for a tournament (Admin schedule). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const nowMs = Timestamp.now().toMillis();
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("locks")
    .get();

  const locks: LockPublic[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (!isActiveLock(data, nowMs)) continue;
    const teamKey = data.teamKey === "B" ? "B" : "A";
    locks.push({
      matchId: String(data.matchId ?? d.id.replace(/_[AB]$/, "")),
      teamKey,
      ownerUid: String(data.ownerUid ?? ""),
      ownerName: String(data.ownerName ?? "").trim() || "Unknown tracker",
      expiresAt:
        (data.expiresAt as Timestamp | undefined)?.toDate?.()?.toISOString?.() ?? null,
    });
  }

  return NextResponse.json({ locks });
}
