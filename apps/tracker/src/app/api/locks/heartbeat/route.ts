import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { TeamKeySchema } from "@bsc/shared";
import { getAdminDb } from "../../../../lib/firebase/admin";
import { requireTracker } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

/** Lock lease renewed by the tracker UI every ~60s; a dead tablet frees in ~5 min. */
const LOCK_TTL_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const body = (await req.json().catch(() => ({}))) as any;

  const tournamentId = String(body?.tournamentId ?? "").trim();
  const matchId = String(body?.matchId ?? "").trim();
  const teamKeyParsed = TeamKeySchema.safeParse(body?.teamKey);
  if (!tournamentId || !matchId || !teamKeyParsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const teamKey = teamKeyParsed.data as "A" | "B";

  const lockRef = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("locks")
    .doc(`${matchId}_${teamKey}`);
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + LOCK_TTL_MS);

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(lockRef);
      if (!snap.exists) return { ok: false as const, reason: "Lock not found" };
      const lock = snap.data() as any;
      if (lock?.ownerUid !== user.uid) return { ok: false as const, reason: "Not lock owner" };
      if (lock?.releasedAt) return { ok: false as const, reason: "Lock was released" };
      t.update(lockRef, { expiresAt, heartbeatAt: now });
      return { ok: true as const, expiresAt: expiresAt.toDate().toISOString() };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Lock heartbeat failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
