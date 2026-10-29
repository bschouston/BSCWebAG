import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { livePageTitle, registrationNavTitle } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { getRegisteredTracker } from "@/lib/sport-tracker-registry";
import { registrationBelongsInTournament } from "@/lib/registration-status";
import {
  buildTournamentPlayer,
  playerProfileConfigFromInput,
} from "@/lib/tournament-player-profile";

export const dynamic = "force-dynamic";

type ConvertBody = {
  eventId?: string;
  statTrackerId?: string;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  playerProfile?: unknown;
};

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
  const tournamentStatus: "DRAFT" | "ACTIVE" | "ARCHIVED" =
    body.status ?? "ACTIVE";
  if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(tournamentStatus)) {
    return NextResponse.json(
      { error: "status must be DRAFT, ACTIVE, or ARCHIVED" },
      { status: 400 }
    );
  }

  const statTrackerId = String(body?.statTrackerId ?? "").trim();
  if (!statTrackerId) {
    return NextResponse.json({ error: "Choose a stat tracker." }, { status: 400 });
  }
  const tracker = await getRegisteredTracker(statTrackerId);
  if (!tracker) {
    return NextResponse.json(
      {
        error: `Unknown or unregistered stat tracker: ${statTrackerId}. Create it in the tracker app under All trackers first.`,
      },
      { status: 400 }
    );
  }

  const formId = typeof event?.registrationFormId === "string" ? event.registrationFormId.trim() : "";
  if (!formId) {
    return NextResponse.json(
      { error: "Attach a registration form to this event before converting." },
      { status: 400 }
    );
  }
  const formSnap = await adminDb.collection("registrationForms").doc(formId).get();
  if (!formSnap.exists) {
    return NextResponse.json({ error: "Registration form not found." }, { status: 404 });
  }
  const formFields = Array.isArray(formSnap.data()?.fields) ? formSnap.data()?.fields : [];
  const enabledFields = (formFields as { id?: unknown; label?: unknown; enabled?: unknown }[])
    .filter((field) => field.enabled !== false && typeof field.id === "string" && field.id.trim())
    .map((field) => ({
      id: String(field.id).trim(),
      label: typeof field.label === "string" && field.label.trim() ? field.label.trim() : String(field.id).trim(),
    }));
  const parsedProfile = playerProfileConfigFromInput(body.playerProfile, enabledFields);
  if ("error" in parsedProfile) {
    return NextResponse.json({ error: parsedProfile.error }, { status: 400 });
  }
  const playerProfile = parsedProfile.config;

  const now = Timestamp.now();
  const tournamentRef = adminDb.collection("tournaments").doc();

  // Pull all registrations as players (skip drafts)
  const regsSnap = await eventRef.collection("event_registrations").get();
  const regs = regsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter((r) => !(r as { isDraft?: boolean }).isDraft && registrationBelongsInTournament(r as Parameters<typeof registrationBelongsInTournament>[0]));

  const eventTitle = String(event?.title ?? "").trim() || "Tournament";
  // Same display title as public Live / Registration nav (strips "Registration - ").
  const name = livePageTitle(
    registrationNavTitle(
      eventTitle,
      typeof event?.registrationFormType === "string" ? event.registrationFormType : undefined
    ),
    statTrackerId
  );

  await adminDb.runTransaction(async (t) => {
    t.set(tournamentRef, {
      name,
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
      statTrackerVersion: tracker.version || "v1",
      eventId,
      playerProfile,
      publicLiveEnabled: tournamentStatus === "ACTIVE",
      publicIframeEmbedHtml: null,
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
    const built = buildTournamentPlayer(reg, playerProfile);
    batch.set(playerRef, {
      displayName: built.displayName,
      teamId: null,
      profile: built.publicProfile,
      ...(built.portraitUrl ? { portraitUrl: built.portraitUrl } : {}),
      createdAt: now,
    });
    batch.set(tournamentRef.collection("playersPrivate").doc(playerRef.id), {
      profile: built.privateProfile,
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

