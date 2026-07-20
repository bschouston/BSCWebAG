import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { writeTrackerAuditLog } from "@/lib/tracker-audit";

export const dynamic = "force-dynamic";

/** Mark the tracker session inactive on sign-out (Admin list status). */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userRef = adminDb.collection("users").doc(decoded.uid);
    const userSnap = await userRef.get();
    const data = userSnap.data() as
      | { firstName?: string; lastName?: string; email?: string; isGoogleTracker?: boolean }
      | undefined;

    await userRef.set(
      {
        trackerSessionActive: false,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    const displayName = data?.firstName
      ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()
      : decoded.name ?? "Tracker";

    void writeTrackerAuditLog(adminDb, {
      userId: decoded.uid,
      userEmail: data?.email ?? decoded.email ?? null,
      userDisplayName: displayName,
      action: "logout",
      details: {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Tracker logout error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
