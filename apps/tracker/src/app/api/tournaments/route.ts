import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await adminDb.collection("users").doc(uid).get();
  const role = userDoc.data()?.role;
  if (role !== "TRACKER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // No orderBy here: combining it with the status filter requires a composite
  // index. Active tournaments are few, so sort in memory instead.
  const snap = await adminDb
    .collection("tournaments")
    .where("status", "==", "ACTIVE")
    .get();

  const tournaments = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .sort((a: any, b: any) => {
      const aMs = a.createdAt?.toMillis?.() ?? 0;
      const bMs = b.createdAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });
  return NextResponse.json({ tournaments });
}

