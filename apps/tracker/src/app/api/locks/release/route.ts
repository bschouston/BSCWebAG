import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase/admin";
import { TeamKeySchema } from "@bsc/shared";
import { logTrackerMatchAction } from "../../../../lib/tracker-audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  let uid: string;
  let email: string | null = null;
  let displayName = "Tracker";
  try {
    const d = await adminAuth.verifyIdToken(token);
    uid = d.uid;
    email = d.email ?? null;
    displayName = d.name ?? "Tracker";
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tournamentId = String(body?.tournamentId ?? "").trim();
  const matchId = String(body?.matchId ?? "").trim();
  const teamKeyParsed = TeamKeySchema.safeParse(body?.teamKey);
  if (!tournamentId || !matchId || !teamKeyParsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const teamKey = teamKeyParsed.data as "A" | "B";
  const lockId = `${matchId}_${teamKey}`;
  const lockRef = adminDb.collection("tournaments").doc(tournamentId).collection("locks").doc(lockId);

  try {
    await adminDb.runTransaction(async (t) => {
      const snap = await t.get(lockRef);
      if (!snap.exists) return;
      const data = snap.data() as any;
      if (data.ownerUid && data.ownerUid !== uid) {
        throw new Error("Forbidden");
      }
      t.update(lockRef, { releasedAt: Timestamp.now() });
    });

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data() as { email?: string; firstName?: string; lastName?: string } | undefined;
    if (userData?.firstName) {
      displayName = `${userData.firstName ?? ""} ${userData.lastName ?? ""}`.trim();
    }
    email = userData?.email ?? email;

    void logTrackerMatchAction(
      adminDb,
      { uid, email, displayName },
      tournamentId,
      matchId,
      teamKey,
      "lock_release"
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (String(err?.message).includes("Forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Lock release failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

