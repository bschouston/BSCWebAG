import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import {
  resolveStatTrackerIdForEventSport,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  VOLLEYBALL_LIVE_SHEET_IFRAME_HTML,
  isVolleyballStatTrackerId,
} from "@/lib/live-volleyball-sheet";
import {
  isRegisteredStatTrackerId,
  weightsForRegisteredTracker,
} from "@/lib/sport-tracker-registry";

export const dynamic = "force-dynamic";

type ConvertBody = {
  eventId?: string;
  statTrackerId?: string;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
};

import {
  displayNameFromRegistration,
  syncRegistrationToTournament,
} from "@/lib/registration-tournament-sync";
import { publicProfileFromRegistration } from "@/lib/registration-public-profile";
import { registrationBelongsInTournament } from "@/lib/registration-status";
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

  // Duplicate guard: an event maps to at most one tournament.
  if (event?.tournamentId) {
    return NextResponse.json(
      {
        error: "Event was already converted to a tournament",
        tournamentId: String(event.tournamentId),
      },
      { status: 409 }
    );
  }

  // Converting is an explicit admin action — default to ACTIVE so it shows up under "Active"
  // tournaments immediately.
  const tournamentStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED" =
    body.status ?? "ACTIVE";

  // Attach only a registered sport tracker. Never invent e.g. soccer.v1.
  const eventSportId = String(event?.sportId ?? "").toLowerCase().trim();
  const explicitTracker = body?.statTrackerId ? String(body.statTrackerId).trim() : null;
  const candidateId = resolveStatTrackerIdForEventSport(eventSportId, explicitTracker);
  if (!candidateId || !(await isRegisteredStatTrackerId(candidateId))) {
    return NextResponse.json(
      {
        error:
          explicitTracker
            ? `Unknown or unregistered stat tracker: ${explicitTracker}. Create it in the tracker app first.`
            : `No registered tracker for event sport "${eventSportId || "(none)"}". Create the sport tracker in the tracker app, then convert with that statTrackerId.`,
      },
      { status: 400 }
    );
  }
  const statTrackerId = candidateId;

  const now = Timestamp.now();
  const tournamentRef = adminDb.collection("tournaments").doc();
  const statPointWeights = await weightsForRegisteredTracker(statTrackerId);

  // Pull all registrations as players (skip drafts)
  const regsSnap = await eventRef.collection("event_registrations").get();
  const regs = regsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((r) => !(r as { isDraft?: boolean }).isDraft && registrationBelongsInTournament(r as Parameters<typeof registrationBelongsInTournament>[0]));

  await adminDb.runTransaction(async (t) => {
    t.set(tournamentRef, {
      name: event?.title ?? "Tournament",
      description: event?.description ?? null,
      status: tournamentStatus,
      startDate: event?.startTime?.toDate?.()?.toISOString?.() ?? null,
      endDate: event?.endTime?.toDate?.()?.toISOString?.() ?? null,
      eventLocation: event?.eventLocation ?? null,
      sportId: event?.sportId ?? null,
      imageUrl: event?.imageUrl ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      statTrackerId,
      statTrackerVersion: "v1",
      eventId,
      // Leaderboard weights seeded from the tracker's container module; editable by admin.
      statPointWeights,
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
    const playerRef = tournamentRef.collection("players").doc(reg.id);
    // Player docs become publicly readable on the Live page — keep PII
    // (email, registration linkage) in a server-only mirror collection.
    const profile = publicProfileFromRegistration(reg);
    batch.set(playerRef, {
      displayName: displayNameFromRegistration(reg),
      number: reg?.jerseyNumber ?? reg?.number ?? null,
      teamId: null,
      ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
      ...(profile.height ? { height: profile.height } : {}),
      ...(profile.dateOfBirth ? { dateOfBirth: profile.dateOfBirth } : {}),
      ...(profile.skills.length ? { skills: profile.skills } : {}),
      createdAt: now,
    });
    batch.set(tournamentRef.collection("playersPrivate").doc(playerRef.id), {
      email: reg?.email ?? null,
      source: { type: "event_registration", eventId, registrationId: reg.id },
      createdAt: now,
    });
    ops += 2;
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

