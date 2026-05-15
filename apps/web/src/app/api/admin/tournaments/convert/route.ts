import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  VOLLEYBALL_LIVE_SHEET_IFRAME_HTML,
  isVolleyballStatTrackerId,
} from "@/lib/live-volleyball-sheet";

export const dynamic = "force-dynamic";

type ConvertBody = {
  eventId?: string;
  statTrackerId?: string;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED";
};

function displayNameFromRegistration(reg: any) {
  const first = String(reg?.firstName ?? "").trim();
  const last = String(reg?.lastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || String(reg?.teamName ?? reg?.email ?? "Player").trim();
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const body = (await req.json().catch(() => ({}))) as ConvertBody;

  const eventId = String(body?.eventId ?? "").trim();
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const eventRef = adminDb.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const event = eventSnap.data() as any;
  // Converting is an explicit admin action — default to ACTIVE so it shows up under "Active"
  // tournaments immediately.
  const tournamentStatus: "DRAFT" | "ACTIVE" | "COMPLETED" = body.status ?? "ACTIVE";

  // Default volleyball tracker for now (can be extended to map sport->tracker later)
  const statTrackerId = String(body?.statTrackerId ?? "volleyball.v1");

  const now = Timestamp.now();
  const tournamentRef = adminDb.collection("tournaments").doc();

  // Pull all registrations as players (skip drafts)
  const regsSnap = await eventRef.collection("event_registrations").get();
  const regs = regsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((r: any) => !r.isDraft);

  await adminDb.runTransaction(async (t) => {
    t.set(tournamentRef, {
      name: event?.title ?? "Tournament",
      status: tournamentStatus,
      startDate: event?.startTime?.toDate?.()?.toISOString?.() ?? null,
      endDate: event?.endTime?.toDate?.()?.toISOString?.() ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      statTrackerId,
      statTrackerVersion: "v1",
      eventId,
      // Public "Live" page is enabled for active tournaments.
      publicLiveEnabled: tournamentStatus === "ACTIVE",
      publicIframeEmbedHtml: isVolleyballStatTrackerId(statTrackerId)
        ? VOLLEYBALL_LIVE_SHEET_IFRAME_HTML
        : null,
    });

    // Mark the source event as converted so it no longer shows up in the "Featured events"
    // conversion list, without changing its category enum.
    t.update(eventRef, {
      tournamentId: tournamentRef.id,
      convertedToTournamentAt: now,
    });
  });

  // Batch import players (500 writes per batch)
  let batch = adminDb.batch();
  let ops = 0;
  let imported = 0;
  for (const reg of regs as any[]) {
    const playerRef = tournamentRef.collection("players").doc();
    batch.set(playerRef, {
      displayName: displayNameFromRegistration(reg),
      number: reg?.jerseyNumber ?? reg?.number ?? null,
      teamId: null,
      email: reg?.email ?? null,
      source: { type: "event_registration", eventId, registrationId: reg.id },
      createdAt: now,
    });
    ops += 1;
    imported += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  return NextResponse.json({ tournamentId: tournamentRef.id, importedPlayers: imported });
}

