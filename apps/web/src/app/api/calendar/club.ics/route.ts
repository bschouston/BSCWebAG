import { getAdminDb } from "@/lib/firebase/admin";
import { eventPageUrl } from "@/lib/calendar-urls";
import {
  buildIcsCalendar,
  clubEventUid,
  icsResponse,
  toUtcDate,
  type IcsEvent,
} from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("events").where("isPublic", "==", true).get();
    const events: IcsEvent[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const status = String(data.status || "");
      if (status === "DRAFT") continue;
      const start = toUtcDate(data.startTime);
      const end = toUtcDate(data.endTime) ?? start;
      if (!start || !end) continue;

      const cancelled = status === "CANCELLED";
      const loc = [data.locationId, data.eventLocation].filter(Boolean).join(" · ");
      events.push({
        uid: clubEventUid(doc.id),
        start,
        end,
        title: String(data.title || "BSC event"),
        description: [
          data.description ? String(data.description) : "",
          "Times in America/Chicago.",
        ]
          .filter(Boolean)
          .join("\n"),
        location: loc || undefined,
        url: eventPageUrl({ id: doc.id, slug: typeof data.slug === "string" ? data.slug : null }),
        status: cancelled ? "CANCELLED" : "CONFIRMED",
        stamp: toUtcDate(data.updatedAt) ?? toUtcDate(data.createdAt) ?? undefined,
      });
    }

    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    const body = buildIcsCalendar({ name: "BSC Houston", events });
    return icsResponse(body, "bsc-club.ics", "public");
  } catch (error) {
    console.error("club.ics", error);
    return new Response("Failed to build calendar", { status: 500 });
  }
}
