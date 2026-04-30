import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase/admin";
import { TeamKeySchema } from "@bsc/shared";

export const dynamic = "force-dynamic";

const LockRequestSchema = {
  parse(input: any) {
    const teamKey = TeamKeySchema.safeParse(input?.teamKey);
    if (!teamKey.success) throw new Error("Invalid teamKey");
    const tournamentId = String(input?.tournamentId ?? "").trim();
    const matchId = String(input?.matchId ?? "").trim();
    if (!tournamentId) throw new Error("Missing tournamentId");
    if (!matchId) throw new Error("Missing matchId");
    return { tournamentId, matchId, teamKey: teamKey.data as "A" | "B" };
  },
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  let decoded: { uid: string; name?: string } | null = null;
  try {
    const d = await adminAuth.verifyIdToken(token);
    decoded = { uid: d.uid, name: d.name };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "TRACKER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let parsed: { tournamentId: string; matchId: string; teamKey: "A" | "B" };
  try {
    parsed = LockRequestSchema.parse(body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { tournamentId, matchId, teamKey } = parsed;
  const lockId = `${matchId}_${teamKey}`;
  const lockRef = adminDb.collection("tournaments").doc(tournamentId).collection("locks").doc(lockId);

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(lockRef);
      if (snap.exists) {
        const data = snap.data() as any;
        const releasedAt = data.releasedAt as Timestamp | undefined;
        const currentExpiresAt = data.expiresAt as Timestamp | undefined;
        const isExpired = currentExpiresAt ? currentExpiresAt.toMillis() <= now.toMillis() : true;
        const isReleased = !!releasedAt;

        if (!isExpired && !isReleased && data.ownerUid && data.ownerUid !== decoded.uid) {
          return { ok: false as const, conflict: true as const, lock: { id: snap.id, ...data } };
        }
      }

      t.set(
        lockRef,
        {
          matchId,
          teamKey,
          ownerUid: decoded.uid,
          ownerName: userDoc.data()?.firstName
            ? `${userDoc.data()?.firstName ?? ""} ${userDoc.data()?.lastName ?? ""}`.trim()
            : decoded.name ?? "",
          createdAt: now,
          expiresAt,
          releasedAt: null,
        },
        { merge: true }
      );

      return {
        ok: true as const,
        conflict: false as const,
        lock: {
          id: lockId,
          matchId,
          teamKey,
          ownerUid: decoded.uid,
          expiresAt: expiresAt.toDate().toISOString(),
        },
      };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Lock already held", lock: result.lock },
        { status: 409 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Lock acquire failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

