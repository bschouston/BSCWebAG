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

/**
 * Absolute member-cancel close time for an occurrence.
 * `cancelCloses` is an offset **before RSVP close** (not before start).
 * Null/undefined/zero amount → same as RSVP close.
 * Clamped to [opensAt, closesAt] so cancel never outlasts signup or opens early.
 */
export function rsvpCancelClosesAtForStart(
  start: Date,
  opens: RsvpOffset,
  closes: RsvpOffset,
  cancelCloses: RsvpOffset | null | undefined
): Date {
  const window = rsvpWindowForStart(start, opens, closes);
  if (!cancelCloses || !(Number(cancelCloses.amount) > 0)) return window.closesAt;
  const raw = subtractUnit(window.closesAt, cancelCloses.amount, cancelCloses.unit);
  if (raw.getTime() < window.opensAt.getTime()) return window.opensAt;
  if (raw.getTime() > window.closesAt.getTime()) return window.closesAt;
  return raw;
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

/** Prefer explicit cancel close; otherwise RSVP close (legacy default). */
export function resolveRsvpCancelClosesAt(event: {
  rsvpCancelClosesAt?: unknown;
  rsvpClosesAt?: unknown;
}): Date | null {
  return toDateMaybe(event.rsvpCancelClosesAt) ?? toDateMaybe(event.rsvpClosesAt);
}

/**
 * Member cancel window. Requires RSVPs to be effectively open; then follows
 * rsvpCancelClosesAt (else rsvpClosesAt) with an optional cancel override.
 */
export function effectiveMemberCancelWindowState(opts: {
  now?: Date;
  opensAt?: unknown;
  rsvpCancelClosesAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpOverride?: RsvpManualOverride | null;
  cancelOverride?: RsvpManualOverride | null;
}): "before" | "open" | "closed" {
  const rsvpState = effectiveRsvpWindowState({
    now: opts.now,
    opensAt: opts.opensAt,
    closesAt: opts.rsvpClosesAt,
    override: opts.rsvpOverride,
  });
  if (rsvpState !== "open") {
    return rsvpState === "before" ? "before" : "closed";
  }
  return effectiveRsvpWindowState({
    now: opts.now,
    opensAt: opts.opensAt,
    closesAt: resolveRsvpCancelClosesAt({
      rsvpCancelClosesAt: opts.rsvpCancelClosesAt,
      rsvpClosesAt: opts.rsvpClosesAt,
    }),
    override: opts.cancelOverride,
  });
}

export function weeklyMemberCancelWindow(event: {
  category?: string;
  status?: string | null;
  rsvpOpensAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpCancelClosesAt?: unknown;
  rsvpManualOverride?: RsvpManualOverride | null;
  rsvpCancelManualOverride?: RsvpManualOverride | null;
}): "before" | "open" | "closed" | null {
  if (event.category !== "WEEKLY_SPORTS") return null;
  if (event.status === "COMPLETED" || event.status === "CANCELLED") return "closed";
  return effectiveMemberCancelWindowState({
    opensAt: event.rsvpOpensAt,
    rsvpCancelClosesAt: event.rsvpCancelClosesAt,
    rsvpClosesAt: event.rsvpClosesAt,
    rsvpOverride: event.rsvpManualOverride ?? null,
    cancelOverride: event.rsvpCancelManualOverride ?? null,
  });
}
