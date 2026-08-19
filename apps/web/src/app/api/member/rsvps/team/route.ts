import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { weeklyOccurrenceFinished } from "@/lib/weekly-rsvp";
import { WEEKLY_TEAMS_COLLECTION } from "@/lib/weekly-event-teams";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { eventId?: unknown; teamId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const teamId = body.teamId === null || body.teamId === "" ? null : String(body.teamId || "");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const adminDb = getAdminDb();
  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventSnap.data() ?? {};
  if (event.category !== "WEEKLY_SPORTS") {
    return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
  }
  if (
    weeklyOccurrenceFinished({
      category: "WEEKLY_SPORTS",
      status: typeof event.status === "string" ? event.status : null,
    })
  ) {
    return NextResponse.json({ error: "This event is completed or cancelled", code: "OCCURRENCE_DONE" }, { status: 400 });
  }
  if (!event.teamsEnabled) {
    return NextResponse.json({ error: "Teams are not enabled for this event" }, { status: 400 });
  }
  if (event.teamsLocked) {
    return NextResponse.json({ error: "Teams are locked", code: "TEAMS_LOCKED" }, { status: 400 });
  }

  const rsvpId = `${eventId}_${decoded.uid}`;
  const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
  const rsvpSnap = await rsvpRef.get();
  if (!rsvpSnap.exists || rsvpSnap.data()?.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Confirm your RSVP before joining a team" }, { status: 400 });
  }

  if (teamId) {
    const teamSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection(WEEKLY_TEAMS_COLLECTION)
      .doc(teamId)
      .get();
    if (!teamSnap.exists) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
  }

  await rsvpRef.update({ teamId, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true, teamId });
}
