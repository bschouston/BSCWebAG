import { NextRequest, NextResponse } from "next/server";
import { livePageTitle, registrationNavTitle } from "@bsc/shared";
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

  const tournaments = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as Array<Record<string, unknown> & { id: string }>;

  const eventIds = [
    ...new Set(
      tournaments
        .map((t) => (typeof t.eventId === "string" ? t.eventId.trim() : ""))
        .filter(Boolean)
    ),
  ];
  const events = new Map<
    string,
    { title: string; registrationFormType?: string }
  >();
  if (eventIds.length > 0) {
    const refs = eventIds.map((id) => adminDb.collection("events").doc(id));
    const eventSnaps = await adminDb.getAll(...refs);
    for (const eventSnap of eventSnaps) {
      if (!eventSnap.exists) continue;
      const data = eventSnap.data() as {
        title?: unknown;
        registrationFormType?: unknown;
      };
      const title = String(data?.title ?? "").trim();
      if (!title) continue;
      events.set(eventSnap.id, {
        title,
        registrationFormType:
          typeof data.registrationFormType === "string"
            ? data.registrationFormType
            : undefined,
      });
    }
  }

  const withNames = tournaments
    .map((t) => {
      const eventId = typeof t.eventId === "string" ? t.eventId.trim() : "";
      const linked = eventId ? events.get(eventId) : undefined;
      const raw = String(linked?.title ?? t.name ?? "Tournament");
      const statTrackerId =
        typeof t.statTrackerId === "string" ? t.statTrackerId : undefined;
      return {
        ...t,
        name: livePageTitle(
          registrationNavTitle(raw, linked?.registrationFormType),
          statTrackerId
        ),
      };
    })
    .sort((a: any, b: any) => {
      const aMs = a.createdAt?.toMillis?.() ?? 0;
      const bMs = b.createdAt?.toMillis?.() ?? 0;
      return bMs - aMs;
    });

  return NextResponse.json({ tournaments: withNames });
}

