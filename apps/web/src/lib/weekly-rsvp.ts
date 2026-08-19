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

export function chicagoTimeLabel(value: unknown): string {
  const d = toDateMaybe(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sameChicagoDate(a: Date, b: Date): boolean {
  return chicagoDateKey(a) === chicagoDateKey(b);
}
