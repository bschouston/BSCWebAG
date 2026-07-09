import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { completeTrackerSession } from "@/lib/tracker-access-server";
import { writeTrackerAuditLog } from "@/lib/tracker-audit";

export const dynamic = "force-dynamic";

/** Validate tracker login and provision authorized Google accounts. */
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
    const signInProvider =
      (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider ?? null;

    const result = await completeTrackerSession(adminDb, adminAuth, {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      signInProvider,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const data = userSnap.data() as { firstName?: string; lastName?: string; email?: string } | undefined;
    const displayName = data?.firstName
      ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim()
      : decoded.name ?? "Tracker";

    void writeTrackerAuditLog(adminDb, {
      userId: decoded.uid,
      userEmail: data?.email ?? decoded.email ?? null,
      userDisplayName: displayName,
      action: "login",
      details: {
        provider: signInProvider,
        role: result.role,
      },
    });

    return NextResponse.json({ ok: true, role: result.role });
  } catch (err) {
    console.error("Tracker session error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
