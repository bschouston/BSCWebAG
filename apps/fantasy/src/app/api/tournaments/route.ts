import { NextRequest, NextResponse } from "next/server";
import { livePageTitle, registrationNavTitle } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireFantasyUser(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tournaments").where("status", "==", "ACTIVE").get();

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
  const events = new Map<string, { title: string; registrationFormType?: string }>();
  if (eventIds.length > 0) {
    const refs = eventIds.map((id) => adminDb.collection("events").doc(id));
    const eventSnaps = await adminDb.getAll(...refs);
    for (const eventSnap of eventSnaps) {
      if (!eventSnap.exists) continue;
      const data = eventSnap.data() as { title?: unknown; registrationFormType?: unknown };
      const title = String(data?.title ?? "").trim();
      if (!title) continue;
      events.set(eventSnap.id, {
        title,
        registrationFormType:
          typeof data.registrationFormType === "string" ? data.registrationFormType : undefined,
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
        id: t.id,
        name: livePageTitle(
          registrationNavTitle(raw, linked?.registrationFormType),
          statTrackerId
        ),
        status: t.status,
        statTrackerId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ tournaments: withNames });
}
