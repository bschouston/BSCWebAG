import { subtractUnit, type DurationUnit } from "@/lib/chicago-time";

export type RsvpOffset = {
  amount: number;
  unit: DurationUnit;
};

export function rsvpWindowForStart(
  start: Date,
  opens: RsvpOffset,
  closes: RsvpOffset
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: subtractUnit(start, opens.amount, opens.unit),
    closesAt: subtractUnit(start, closes.amount, closes.unit),
  };
}

export function rsvpWindowState(now: Date, opensAt: Date, closesAt: Date): "before" | "open" | "closed" {
  if (now.getTime() < opensAt.getTime()) return "before";
  if (now.getTime() >= closesAt.getTime()) return "closed";
  return "open";
}

export type RsvpManualOverride = "open" | "closed";

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
  return null;
}

/** Scheduled window, with an optional admin force-open / force-close. */
export function effectiveRsvpWindowState(opts: {
  now?: Date;
  opensAt?: unknown;
  closesAt?: unknown;
  override?: RsvpManualOverride | null;
}): "before" | "open" | "closed" {
  if (opts.override === "open") return "open";
  if (opts.override === "closed") return "closed";
  const opensAt = toDateMaybe(opts.opensAt);
  const closesAt = toDateMaybe(opts.closesAt);
  if (!opensAt || !closesAt) return "open";
  return rsvpWindowState(opts.now ?? new Date(), opensAt, closesAt);
}

export function weeklyRsvpWindow(event: {
  category?: string;
  status?: string | null;
  rsvpOpensAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpManualOverride?: RsvpManualOverride | null;
}): "before" | "open" | "closed" | null {
  if (event.category !== "WEEKLY_SPORTS") return null;
  if (event.status === "COMPLETED" || event.status === "CANCELLED") return "closed";
  return effectiveRsvpWindowState({
    opensAt: event.rsvpOpensAt,
    closesAt: event.rsvpClosesAt,
    override: event.rsvpManualOverride ?? null,
  });
}
