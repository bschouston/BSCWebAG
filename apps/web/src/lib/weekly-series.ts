import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { CLUB_TIMEZONE, addUnit, chicagoDateKey, chicagoWallToUtc, weekdayInChicago } from "@/lib/chicago-time";
import { rsvpWindowForStart, type RsvpOffset } from "@/lib/rsvp-window";
import { occurrenceEventSlug, resolveEventSlug } from "@/lib/events/slugify";
import { ensureDefaultWeeklyTeams } from "@/lib/weekly-event-teams";
import { weeklyOccurrenceFinished, weeklyRsvpWindow } from "@/lib/weekly-rsvp";
import {
  clearSeriesIdOnOccurrences,
  deleteWeeklyOccurrence,
  isPristineSkipCode,
  isWeeklyDeleteError,
} from "@/lib/weekly-event-delete";

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
    paused: false,
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
  const s = seriesSnap.data() as WeeklySeriesInput & { timezone?: string; paused?: boolean };
  if (s.paused) return 0;
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

export type WeeklySeriesListItem = {
  id: string;
  title: string;
  adminLabel: string | null;
  paused: boolean;
  sportId: string;
};

/** Card label for Manage Events — adminLabel if set, else template title. */
export { weeklySeriesCardTitle } from "@/lib/weekly-series-display";

export async function listWeeklySeries(): Promise<WeeklySeriesListItem[]> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("weeklySeries").get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const title = typeof d.title === "string" ? d.title : "Weekly series";
    const adminLabel =
      typeof d.adminLabel === "string" && d.adminLabel.trim() ? d.adminLabel.trim() : null;
    return {
      id: doc.id,
      title,
      adminLabel,
      paused: d.paused === true,
      sportId: typeof d.sportId === "string" ? d.sportId : "",
    };
  });
}

export function serializeWeeklySeries(id: string, data: Record<string, unknown>) {
  const rsvpOpens = data.rsvpOpens as { amount?: unknown; unit?: unknown } | undefined;
  const rsvpCloses = data.rsvpCloses as { amount?: unknown; unit?: unknown } | undefined;
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    adminLabel:
      typeof data.adminLabel === "string" && data.adminLabel.trim() ? data.adminLabel.trim() : "",
    description: typeof data.description === "string" ? data.description : "",
    sportId: typeof data.sportId === "string" ? data.sportId : "",
    locationId: typeof data.locationId === "string" ? data.locationId : "",
    addressUrl: typeof data.addressUrl === "string" ? data.addressUrl : "",
    genderPolicy: data.genderPolicy === "MALE_ONLY" || data.genderPolicy === "FEMALE_ONLY" ? data.genderPolicy : "ALL",
    isPublic: data.isPublic !== false,
    status: data.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    weekdays: Array.isArray(data.weekdays) ? data.weekdays.map((n) => Number(n)).filter((d) => d >= 0 && d <= 6) : [],
    localStartTime: typeof data.localStartTime === "string" ? data.localStartTime : "20:00",
    durationMinutes: Number(data.durationMinutes) || 90,
    firstStartLocal: typeof data.firstStartLocal === "string" ? data.firstStartLocal : "",
    untilLocal: typeof data.untilLocal === "string" ? data.untilLocal : "",
    rsvpOpens: {
      amount: Number(rsvpOpens?.amount) || 0,
      unit: rsvpOpens?.unit === "hours" || rsvpOpens?.unit === "minutes" || rsvpOpens?.unit === "days" ? rsvpOpens.unit : "days",
    },
    rsvpCloses: {
      amount: Number(rsvpCloses?.amount) || 0,
      unit: rsvpCloses?.unit === "hours" || rsvpCloses?.unit === "minutes" || rsvpCloses?.unit === "days" ? rsvpCloses.unit : "hours",
    },
    minCapacity: Number(data.minCapacity) || 1,
    maxCapacity: Number(data.maxCapacity) || 1,
    tokensMin: Number(data.tokensMin) || 0,
    tokensMax: Number(data.tokensMax) || 0,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    teamsEnabled: data.teamsEnabled === true,
    paused: data.paused === true,
    slug: typeof data.slug === "string" ? data.slug : "",
  };
}

export async function setWeeklySeriesPaused(seriesId: string, paused: boolean): Promise<{ generated: number }> {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("weeklySeries").doc(seriesId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  await ref.update({ paused, updatedAt: FieldValue.serverTimestamp() });
  const generated = paused ? 0 : await generateOccurrencesForSeries(seriesId);
  return { generated };
}

/** Card-only rename. Does not change events.title or the occurrence title template. */
export async function setWeeklySeriesAdminLabel(
  seriesId: string,
  adminLabel: string | null
): Promise<{ adminLabel: string | null }> {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("weeklySeries").doc(seriesId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const trimmed = typeof adminLabel === "string" ? adminLabel.trim() : "";
  const next = trimmed || null;
  await ref.update({
    adminLabel: next,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { adminLabel: next };
}

export async function deleteWeeklySeries(
  seriesId: string,
  opts?: { adminUid?: string }
): Promise<{ deletedEvents: number; skippedEvents: number; clearedSeriesLinks: number }> {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("weeklySeries").doc(seriesId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");

  const adminUid = opts?.adminUid?.trim() || "system";
  const occ = await adminDb.collection("events").where("seriesId", "==", seriesId).get();
  let deletedEvents = 0;
  let skippedEvents = 0;
  const deletedIds = new Set<string>();

  for (const doc of occ.docs) {
    const data = doc.data();
    const event = {
      category: "WEEKLY_SPORTS" as const,
      status: String(data.status || ""),
      startTime: data.startTime,
      rsvpOpensAt: data.rsvpOpensAt,
      rsvpClosesAt: data.rsvpClosesAt,
      rsvpManualOverride:
        data.rsvpManualOverride === "open" || data.rsvpManualOverride === "closed"
          ? data.rsvpManualOverride
          : null,
    };
    if (weeklyOccurrenceFinished(event)) {
      skippedEvents += 1;
      continue;
    }
    if (weeklyRsvpWindow(event) !== "before") {
      skippedEvents += 1;
      continue;
    }
    try {
      await deleteWeeklyOccurrence(doc.id, { adminUid });
      deletedEvents += 1;
      deletedIds.add(doc.id);
    } catch (err) {
      if (isWeeklyDeleteError(err) && isPristineSkipCode(err.code)) {
        skippedEvents += 1;
        continue;
      }
      throw err;
    }
  }

  await ref.delete();
  const clearedSeriesLinks = await clearSeriesIdOnOccurrences(seriesId, deletedIds);
  return { deletedEvents, skippedEvents, clearedSeriesLinks };
}
