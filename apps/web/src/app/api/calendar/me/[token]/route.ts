import { getAdminDb } from "@/lib/firebase/admin";
import { eventPageUrl } from "@/lib/calendar-urls";
import {
  buildIcsCalendar,
  icsResponse,
  personalEventUid,
  toUtcDate,
  type IcsEvent,
  type IcsStatus,
} from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const raw = (await params).token;
    const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
    if (!token) {
      return new Response("Not found", { status: 404 });
    }

    const adminDb = getAdminDb();
    const feedSnap = await adminDb.collection("calendarFeeds").doc(token).get();
    if (!feedSnap.exists) {
      return new Response("Not found", { status: 404 });
    }
    const userId = String(feedSnap.data()?.userId || "");
    if (!userId) {
      return new Response("Not found", { status: 404 });
    }

    const rsvpsSnap = await adminDb.collection("event_rsvps").where("userId", "==", userId).get();
    const events: IcsEvent[] = [];

    for (const rsvpDoc of rsvpsSnap.docs) {
      const rsvp = rsvpDoc.data();
      const rsvpStatus = String(rsvp.status || "");
      if (rsvpStatus !== "CONFIRMED" && rsvpStatus !== "WAITLISTED" && rsvpStatus !== "CANCELLED") {
        continue;
      }
      const eventId = String(rsvp.eventId || "");
      if (!eventId) continue;
      const eventSnap = await adminDb.collection("events").doc(eventId).get();
      if (!eventSnap.exists) continue;
      const data = eventSnap.data()!;
      const start = toUtcDate(data.startTime);
      const end = toUtcDate(data.endTime) ?? start;
      if (!start || !end) continue;

      const eventCancelled = String(data.status || "") === "CANCELLED";
      let status: IcsStatus = "CONFIRMED";
      if (eventCancelled || rsvpStatus === "CANCELLED") status = "CANCELLED";
      else if (rsvpStatus === "WAITLISTED") status = "TENTATIVE";

      const waitNote =
        rsvpStatus === "WAITLISTED"
          ? `Waitlisted${rsvp.waitlistPosition ? ` #${rsvp.waitlistPosition}` : ""}.`
          : rsvpStatus === "CONFIRMED"
            ? "Confirmed RSVP."
            : "RSVP cancelled.";

      const loc = [data.locationId, data.eventLocation].filter(Boolean).join(" · ");
      events.push({
        uid: personalEventUid(eventId, userId),
        start,
        end,
        title: String(data.title || "BSC event"),
        description: [waitNote, data.description ? String(data.description) : "", "Times in America/Chicago."]
          .filter(Boolean)
          .join("\n"),
        location: loc || undefined,
        url: eventPageUrl({
          id: eventId,
          slug: typeof data.slug === "string" ? data.slug : null,
          category: typeof data.category === "string" ? data.category : null,
        }),
        status,
        stamp: toUtcDate(rsvp.updatedAt) ?? toUtcDate(data.updatedAt) ?? undefined,
      });
    }

    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    const body = buildIcsCalendar({ name: "BSC Houston — My events", events });
    return icsResponse(body, "bsc-my-events.ics", "private");
  } catch (error) {
    console.error("me.ics", error);
    return new Response("Failed to build calendar", { status: 500 });
  }
}
