import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { chicagoDatetimeLocal, chicagoWallToUtc, resolveWeeklyEndUtc } from "@/lib/chicago-time";
import { rsvpWindowForStart } from "@/lib/rsvp-window";
import { chicagoTimeLabel, sameChicagoDate, weeklyOccurrenceStarted } from "@/lib/weekly-rsvp";
import { promoteWaitlistedToFillCapacity } from "@/lib/weekly-waitlist";
import { notifyWeeklyEventUpdated } from "@/lib/notify";

export type OccurrenceUpdateInput = {
  startTimeLocal?: string | null;
  endTimeLocal?: string | null;
  locationId?: string | null;
  capacity?: number | null;
  minCapacity?: number | null;
  tokensMax?: number | null;
  tokensMin?: number | null;
};

export type OccurrenceChange = {
  field: string;
  label: string;
  from: string;
  to: string;
  emphasize?: boolean;
  /** Context row for the email (the other clock time did not change). */
  unchanged?: boolean;
};

function withBothTimesIfEitherChanged(
  changes: OccurrenceChange[],
  nextStart: Date,
  nextEnd: Date
): OccurrenceChange[] {
  const startChanged = changes.some((c) => c.field === "startTime");
  const endChanged = changes.some((c) => c.field === "endTime");
  if (!startChanged && !endChanged) return changes;
  const start =
    changes.find((c) => c.field === "startTime") ?? {
      field: "startTime",
      label: "Start time",
      from: chicagoTimeLabel(nextStart),
      to: chicagoTimeLabel(nextStart),
      unchanged: true,
    };
  const end =
    changes.find((c) => c.field === "endTime") ?? {
      field: "endTime",
      label: "End time",
      from: chicagoTimeLabel(nextEnd),
      to: chicagoTimeLabel(nextEnd),
      unchanged: true,
    };
  return [start, end, ...changes.filter((c) => c.field !== "startTime" && c.field !== "endTime")];
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function localTimePart(isoLocal: string): string {
  const t = isoLocal.includes("T") ? isoLocal.split("T")[1] : isoLocal;
  return t.slice(0, 5);
}

export async function updateWeeklyOccurrence(opts: {
  adminDb: Firestore;
  eventId: string;
  adminUid: string;
  input: OccurrenceUpdateInput;
}): Promise<{ changes: OccurrenceChange[]; emailsSent: number; pendingAuth: number; promoted: number }> {
  const { adminDb, eventId, input } = opts;
  const eventRef = adminDb.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new Error("NOT_FOUND");
  const event = eventSnap.data()!;
  if (event.category !== "WEEKLY_SPORTS") throw new Error("NOT_WEEKLY");
  if (event.status === "COMPLETED" || event.status === "CANCELLED") {
    throw new Error("OCCURRENCE_DONE");
  }
  if (weeklyOccurrenceStarted({ startTime: event.startTime })) {
    throw new Error("EVENT_STARTED");
  }

  const now = new Date();
  const oldStart = toDate(event.startTime);
  const oldEnd = toDate(event.endTime);
  if (!oldStart || !oldEnd) throw new Error("MISSING_TIMES");

  const changes: OccurrenceChange[] = [];
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.startTimeLocal) {
    const newStart = chicagoWallToUtc(
      `${chicagoDatetimeLocal(oldStart).slice(0, 10)}T${localTimePart(input.startTimeLocal)}`
    );
    if (!sameChicagoDate(oldStart, newStart)) throw new Error("DATE_LOCKED");
    if (newStart.getTime() <= now.getTime()) throw new Error("START_IN_PAST");
    if (newStart.getTime() !== oldStart.getTime()) {
      update.startTime = Timestamp.fromDate(newStart);
      changes.push({
        field: "startTime",
        label: "Start time",
        from: chicagoTimeLabel(oldStart),
        to: chicagoTimeLabel(newStart),
        emphasize: true,
      });
    }
  }

  if (input.endTimeLocal) {
    const nextStart =
      update.startTime instanceof Timestamp ? update.startTime.toDate() : oldStart;
    const newEnd = resolveWeeklyEndUtc(nextStart, localTimePart(input.endTimeLocal));
    if (newEnd.getTime() <= nextStart.getTime()) throw new Error("END_BEFORE_START");
    if (newEnd.getTime() !== oldEnd.getTime()) {
      update.endTime = Timestamp.fromDate(newEnd);
      changes.push({
        field: "endTime",
        label: "End time",
        from: chicagoTimeLabel(oldEnd),
        to: chicagoTimeLabel(newEnd),
        emphasize: true,
      });
    }
  }

  if (typeof input.locationId === "string") {
    const next = input.locationId.trim();
    const prev = String(event.locationId || "").trim();
    if (next !== prev) {
      update.locationId = next || null;
      changes.push({
        field: "locationId",
        label: "Location",
        from: prev || "TBD",
        to: next || "TBD",
      });
    }
  }

  const confirmed = num(event.confirmedCount);
  if (input.capacity != null) {
    const next = Math.floor(num(input.capacity));
    if (next < 1) throw new Error("INVALID_CAPACITY");
    if (next < confirmed) throw new Error("CAPACITY_BELOW_CONFIRMED");
    const prev = Math.floor(num(event.capacity));
    if (next !== prev) {
      update.capacity = next;
      changes.push({
        field: "capacity",
        label: "Capacity",
        from: String(prev),
        to: String(next),
      });
    }
  }

  if (input.minCapacity != null) {
    const next = Math.floor(num(input.minCapacity));
    if (next < 1) throw new Error("INVALID_MIN_CAPACITY");
    const prev = Math.floor(num(event.minCapacity, 1));
    if (next !== prev) {
      update.minCapacity = next;
      changes.push({
        field: "minCapacity",
        label: "Minimum capacity",
        from: String(prev),
        to: String(next),
      });
    }
  }

  const nextMax =
    input.tokensMax != null ? Math.max(0, Math.floor(num(input.tokensMax))) : Math.floor(num(event.tokensMax ?? event.tokensRequired));
  const nextMin =
    input.tokensMin != null ? Math.max(0, Math.floor(num(input.tokensMin))) : Math.floor(num(event.tokensMin, nextMax));
  if (nextMin > nextMax) throw new Error("MIN_ABOVE_MAX");

  const prevMax = Math.floor(num(event.tokensMax ?? event.tokensRequired));
  const prevMin = Math.floor(num(event.tokensMin, prevMax));

  const rsvpsSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
  const active = rsvpsSnap.docs.filter((d) => {
    const st = d.data().status;
    return st === "CONFIRMED" || st === "WAITLISTED";
  });

  if (input.tokensMin != null && nextMin > prevMin) {
    for (const doc of active) {
      const held = Number(doc.data().tokensHeld) || 0;
      if (nextMin > held) throw new Error("MIN_ABOVE_HOLD");
    }
  }

  if (input.tokensMax != null && nextMax !== prevMax) {
    update.tokensMax = nextMax;
    update.tokensRequired = nextMax;
    changes.push({
      field: "tokensMax",
      label: "Token hold (max)",
      from: String(prevMax),
      to: String(nextMax),
      emphasize: nextMax > prevMax,
    });
  }
  if (input.tokensMin != null && nextMin !== prevMin) {
    update.tokensMin = nextMin;
    changes.push({
      field: "tokensMin",
      label: "Token minimum (as low as)",
      from: String(prevMin),
      to: String(nextMin),
    });
  }

  const nextCap = typeof update.capacity === "number" ? update.capacity : Math.floor(num(event.capacity));
  const nextMinCap =
    typeof update.minCapacity === "number" ? update.minCapacity : Math.floor(num(event.minCapacity, 1));
  if (nextMinCap > nextCap) throw new Error("MIN_CAP_ABOVE_MAX");

  if (changes.length === 0) {
    return { changes, emailsSent: 0, pendingAuth: 0, promoted: 0 };
  }

  if (update.startTime instanceof Timestamp) {
    const seriesId = typeof event.seriesId === "string" ? event.seriesId : null;
    if (seriesId) {
      const seriesSnap = await adminDb.collection("weeklySeries").doc(seriesId).get();
      const series = seriesSnap.data();
      if (series?.rsvpOpens && series?.rsvpCloses) {
        const window = rsvpWindowForStart(update.startTime.toDate(), series.rsvpOpens, series.rsvpCloses);
        update.rsvpOpensAt = Timestamp.fromDate(window.opensAt);
        update.rsvpClosesAt = Timestamp.fromDate(window.closesAt);
      }
    }
  }

  await eventRef.update(update);

  const tokensMaxChanged = input.tokensMax != null && nextMax !== prevMax;
  let pendingAuth = 0;
  if (tokensMaxChanged) {
    for (const doc of active) {
      const held = Number(doc.data().tokensHeld) || 0;
      if (held < nextMax) {
        await doc.ref.update({
          pendingTokenIncreaseTo: nextMax,
          updatedAt: FieldValue.serverTimestamp(),
        });
        pendingAuth += 1;
      } else {
        await doc.ref.update({
          pendingTokenIncreaseTo: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  const slots = nextCap - confirmed;
  let promoted = 0;
  if (slots > 0 && typeof update.capacity === "number") {
    promoted = await promoteWaitlistedToFillCapacity(adminDb, eventId, slots);
  }

  const notifyWorthy = changes.some(
    (c) =>
      c.field === "startTime" ||
      c.field === "endTime" ||
      c.field === "locationId" ||
      (c.field === "tokensMax" && (nextMax > prevMax || pendingAuth > 0)) ||
      (c.field === "tokensMin" && nextMin > prevMin)
  );

  let emailsSent = 0;
  if (notifyWorthy) {
    const eventTitle = String(event.title || "Weekly event");
    const nextStart =
      update.startTime instanceof Timestamp ? update.startTime.toDate() : oldStart;
    const nextEnd = update.endTime instanceof Timestamp ? update.endTime.toDate() : oldEnd;
    const emailChanges = withBothTimesIfEitherChanged(changes, nextStart, nextEnd);
    for (const doc of active) {
      const uid = String(doc.data().userId || "");
      if (!uid) continue;
      const u = await adminDb.collection("users").doc(uid).get();
      const email = u.data()?.email;
      if (typeof email !== "string") continue;
      const held = Number(doc.data().tokensHeld) || 0;
      const pending = tokensMaxChanged
        ? held < nextMax
          ? nextMax
          : 0
        : Number(doc.data().pendingTokenIncreaseTo) || 0;
      const needsAuth = pending > held;
      notifyWeeklyEventUpdated({
        to: email,
        name: [u.data()?.firstName, u.data()?.lastName].filter(Boolean).join(" ") || "Member",
        eventTitle,
        eventId,
        changes: emailChanges,
        needsTokenAuth: needsAuth,
        newTokenHold: needsAuth ? nextMax : null,
        previousTokenHold: needsAuth ? held : null,
      }).catch((e) => console.error("event update email", e));
      emailsSent += 1;
    }
  }

  return { changes, emailsSent, pendingAuth, promoted };
}
