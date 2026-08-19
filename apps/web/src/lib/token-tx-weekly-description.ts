import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { weeklyLedgerDescriptionForDisplay } from "@/lib/weekly-rsvp";

type WeeklyEventDisplay = { slug?: string; title?: string; weekly: boolean };

function eventIdFromTxRow(row: { eventId?: unknown; meta?: unknown }): string {
  if (typeof row.eventId === "string" && row.eventId.trim()) return row.eventId.trim();
  const meta = row.meta;
  if (meta && typeof meta === "object" && "eventId" in meta) {
    const nested = (meta as { eventId?: unknown }).eventId;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return "";
}

async function weeklyEventsById(
  db: Firestore,
  eventIds: Iterable<string>
): Promise<Map<string, WeeklyEventDisplay>> {
  const unique = [...new Set([...eventIds].filter(Boolean))];
  const map = new Map<string, WeeklyEventDisplay>();
  if (unique.length === 0) return map;

  const refs = unique.map((id) => db.collection("events").doc(id));
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    map.set(snap.id, {
      weekly: data.category === "WEEKLY_SPORTS",
      slug: typeof data.slug === "string" ? data.slug : undefined,
      title: typeof data.title === "string" ? data.title : undefined,
    });
  }
  return map;
}

/** Rewrite weekly token descriptions to use event slug (including historical title suffixes). */
export async function descriptionsWithWeeklyEventSlug<
  T extends { eventId?: unknown; description?: unknown; meta?: unknown },
>(db: Firestore, rows: T[]): Promise<(string | null)[]> {
  const eventIds = rows.map((row) => eventIdFromTxRow(row));
  const events = await weeklyEventsById(db, eventIds);
  return rows.map((row, i) => {
    const raw = typeof row.description === "string" ? row.description : null;
    const event = eventIds[i] ? events.get(eventIds[i]) : undefined;
    if (!raw || !event?.weekly) return raw;
    return weeklyLedgerDescriptionForDisplay(raw, event);
  });
}
