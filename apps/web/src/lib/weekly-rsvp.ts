import { chicagoDateKey } from "@/lib/chicago-time";
import { effectiveRsvpWindowState, weeklyRsvpWindow } from "@/lib/rsvp-window";

export { weeklyRsvpWindow } from "@/lib/rsvp-window";

/** Weekly token RSVP flow — not featured tournaments / registration forms. */
export function isWeeklyRsvpEvent(event: { category?: string | null } | null | undefined): boolean {
  return event?.category === "WEEKLY_SPORTS";
}

function toDateMaybe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    const d = new Date((value as { toMillis: () => number }).toMillis());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Weekly occurrence is finalized or cancelled and must not be edited. */
export function weeklyOccurrenceFinished(event: {
  category?: string | null;
  status?: string | null;
}): boolean {
  return (
    event.category === "WEEKLY_SPORTS" &&
    (event.status === "COMPLETED" || event.status === "CANCELLED")
  );
}

/** True once the scheduled RSVP window has opened (or was force-opened). Edit details is then locked. */
export function weeklyDetailsEditLocked(event: {
  category?: string | null;
  rsvpOpensAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpManualOverride?: "open" | "closed" | null;
}): boolean {
  if (event.category !== "WEEKLY_SPORTS") return false;
  if (weeklyRsvpWindow({
    category: event.category ?? undefined,
    rsvpOpensAt: event.rsvpOpensAt,
    rsvpClosesAt: event.rsvpClosesAt,
    rsvpManualOverride: event.rsvpManualOverride ?? null,
  }) === "open") return true;
  const scheduled = effectiveRsvpWindowState({
    opensAt: event.rsvpOpensAt,
    closesAt: event.rsvpClosesAt,
    override: null,
  });
  return scheduled !== "before";
}

export function weeklyOccurrenceStarted(
  event: { startTime?: unknown },
  now = new Date()
): boolean {
  const start = toDateMaybe(event.startTime);
  if (!start) return false;
  return now.getTime() >= start.getTime();
}

/**
 * Published weekly occurrence whose end (or start) has passed without finalize/cancel.
 * UI “OVERDUE” and daily admin digest share this definition.
 */
export function weeklyOccurrenceOverdue(
  event: {
    category?: string | null;
    status?: string | null;
    startTime?: unknown;
    endTime?: unknown;
  },
  now = new Date()
): boolean {
  if (event.category !== "WEEKLY_SPORTS") return false;
  if (event.status !== "PUBLISHED") return false;
  const end = toDateMaybe(event.endTime) ?? toDateMaybe(event.startTime);
  if (!end) return false;
  return now.getTime() > end.getTime();
}

const CHICAGO_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: "America/Chicago",
  weekday: "short",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const CHICAGO_TIME: Intl.DateTimeFormatOptions = {
  timeZone: "America/Chicago",
  hour: "numeric",
  minute: "2-digit",
};

const CHICAGO_DATE: Intl.DateTimeFormatOptions = {
  timeZone: "America/Chicago",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
};

/** Chicago wall time for emails and member-facing weekly labels (no seconds). */
export function chicagoTimeLabel(value: unknown): string {
  const d = toDateMaybe(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", CHICAGO_DATETIME);
}

export function chicagoDateLabel(value: unknown): string {
  const d = toDateMaybe(value);
  if (!d) return "TBD";
  return d.toLocaleDateString("en-US", CHICAGO_DATE);
}

export function chicagoTimeOnlyLabel(value: unknown): string {
  const d = toDateMaybe(value);
  if (!d) return "TBD";
  return d.toLocaleTimeString("en-US", CHICAGO_TIME);
}

export function chicagoTimeRangeLabel(start: unknown, end?: unknown): string {
  const startLabel = chicagoTimeOnlyLabel(start);
  if (!end) return startLabel;
  const endLabel = chicagoTimeOnlyLabel(end);
  if (startLabel === "TBD" && endLabel === "TBD") return "TBD";
  if (endLabel === "TBD") return startLabel;
  return `${startLabel} – ${endLabel}`;
}

export function sameChicagoDate(a: Date, b: Date): boolean {
  return chicagoDateKey(a) === chicagoDateKey(b);
}

/** Next hold cycle when (re)RSVPing; increments from prior doc including cancelled. */
export function nextRsvpHoldGeneration(priorRsvp: Record<string, unknown> | undefined): number {
  return (Number(priorRsvp?.holdGeneration) || 0) + 1;
}

export function rsvpHoldIdempotencyKey(rsvpId: string, holdGeneration: number): string {
  return `rsvp_hold_${rsvpId}_g${holdGeneration}`;
}

/** Legacy RSVPs without holdGeneration keep the original refund key. */
export function rsvpCancelRefundIdempotencyKey(rsvpId: string, holdGeneration: unknown): string {
  const gen = Number(holdGeneration) || 0;
  if (gen > 0) return `rsvp_cancel_refund_${rsvpId}_g${gen}`;
  return `rsvp_cancel_refund_${rsvpId}`;
}

/** Unique weekly event label for token ledger descriptions (slug, else title). */
export function weeklyEventTraceLabel(event: {
  slug?: unknown;
  title?: unknown;
}): string {
  const slug = typeof event.slug === "string" ? event.slug.trim() : "";
  if (slug) return slug;
  const title = typeof event.title === "string" ? event.title.trim() : "";
  return title || "weekly-event";
}

/** Swap a stored title suffix for the weekly slug so existing ledger rows match new writes. */
export function weeklyLedgerDescriptionForDisplay(
  description: string,
  event: { slug?: unknown; title?: unknown }
): string {
  const slug = weeklyEventTraceLabel(event);
  const title = typeof event.title === "string" ? event.title.trim() : "";
  if (!description || !title || title === slug) return description;
  if (description.includes(title)) return description.split(title).join(slug);
  return description;
}
