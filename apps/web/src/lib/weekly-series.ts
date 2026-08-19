import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { CLUB_TIMEZONE, addUnit, chicagoDateKey, chicagoWallToUtc, weekdayInChicago } from "@/lib/chicago-time";
import { rsvpWindowForStart, type RsvpOffset } from "@/lib/rsvp-window";
import { occurrenceEventSlug, resolveEventSlug } from "@/lib/events/slugify";
import { ensureDefaultWeeklyTeams } from "@/lib/weekly-event-teams";

export const WEEKLY_HORIZON_WEEKS = 8;

export type WeeklySeriesInput = {
  title: string;
  description?: string | null;
  sportId: string;
  locationId?: string | null;
  addressUrl?: string | null;
  genderPolicy: "ALL" | "MALE_ONLY" | "FEMALE_ONLY";
  isPublic: boolean;
  status: "DRAFT" | "PUBLISHED";
  weekdays: number[];
  localStartTime: string;
  durationMinutes: number;
  firstStartLocal: string;
  untilLocal?: string | null;
  rsvpOpens: RsvpOffset;
  rsvpCloses: RsvpOffset;
  minCapacity: number;
  maxCapacity: number;
  tokensMin: number;
  tokensMax: number;
  imageUrl?: string | null;
  slug?: string | null;
  teamsEnabled?: boolean;
};

function localTimeFromDatetime(local: string): string {
  const [, time = "20:00"] = local.split("T");
  return time.slice(0, 5);
}

export async function createWeeklySeries(createdBy: string, input: WeeklySeriesInput) {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("weeklySeries").doc();
  const slug = resolveEventSlug(input.slug, input.title) || null;
  const payload = {
    ...input,
    slug,
    timezone: CLUB_TIMEZONE,
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  const generated = await generateOccurrencesForSeries(ref.id);
  return { id: ref.id, generated };
}

export async function generateOccurrencesForSeries(seriesId: string): Promise<number> {
  const adminDb = getAdminDb();
  const seriesSnap = await adminDb.collection("weeklySeries").doc(seriesId).get();
  if (!seriesSnap.exists) return 0;
  const s = seriesSnap.data() as WeeklySeriesInput & { timezone?: string };
  const weekdays = (s.weekdays || []).filter((d) => d >= 0 && d <= 6);
  if (weekdays.length === 0) return 0;

  const time = s.localStartTime || localTimeFromDatetime(s.firstStartLocal);
  const first = chicagoWallToUtc(s.firstStartLocal);
  const until = s.untilLocal ? chicagoWallToUtc(`${s.untilLocal}T23:59:00`) : null;
  const horizonEnd = addUnit(new Date(), WEEKLY_HORIZON_WEEKS * 7, "days");
  const capEnd = until && until.getTime() < horizonEnd.getTime() ? until : horizonEnd;

  const existing = await adminDb.collection("events").where("seriesId", "==", seriesId).get();
  const existingKeys = new Set(
    existing.docs.map((d) => String(d.data().occurrenceKey || ""))
  );

  let created = 0;
  const cursor = new Date(first.getTime());
  while (cursor.getTime() <= capEnd.getTime()) {
    const wd = weekdayInChicago(cursor);
    if (weekdays.includes(wd) && cursor.getTime() >= first.getTime() - 60_000) {
      const key = chicagoDateKey(cursor);
      if (!existingKeys.has(key)) {
        const dateParts = key.split("-");
        const start = chicagoWallToUtc(`${dateParts[0]}-${dateParts[1]}-${dateParts[2]}T${time}`);
        const end = addUnit(start, s.durationMinutes || 90, "minutes");
        const window = rsvpWindowForStart(start, s.rsvpOpens, s.rsvpCloses);
        const eventRef = adminDb.collection("events").doc();
        const baseSlug = resolveEventSlug(s.slug, s.title);
        await eventRef.set({
          title: s.title,
          description: s.description ?? null,
          category: "WEEKLY_SPORTS",
          sportId: s.sportId,
          locationId: s.locationId ?? null,
          addressUrl: s.addressUrl ?? null,
          genderPolicy: s.genderPolicy,
          isPublic: s.isPublic !== false,
          status: s.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
          startTime: Timestamp.fromDate(start),
          endTime: Timestamp.fromDate(end),
          capacity: s.maxCapacity,
          minCapacity: s.minCapacity,
          tokensMin: s.tokensMin,
          tokensMax: s.tokensMax,
          tokensRequired: s.tokensMax,
          rsvpOpensAt: Timestamp.fromDate(window.opensAt),
          rsvpClosesAt: Timestamp.fromDate(window.closesAt),
          seriesId,
          occurrenceKey: key,
          slug: baseSlug ? occurrenceEventSlug(baseSlug, key) : null,
          timezone: CLUB_TIMEZONE,
          confirmedCount: 0,
          waitlistCount: 0,
          imageUrl: s.imageUrl ?? null,
          teamsEnabled: Boolean(s.teamsEnabled),
          teamsLocked: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (s.teamsEnabled) {
          await ensureDefaultWeeklyTeams(adminDb, eventRef.id);
        }
        existingKeys.add(key);
        created += 1;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return created;
}

export async function generateAllSeriesHorizons(): Promise<{ series: number; created: number }> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("weeklySeries").get();
  let created = 0;
  for (const doc of snap.docs) {
    created += await generateOccurrencesForSeries(doc.id);
  }
  return { series: snap.size, created };
}
