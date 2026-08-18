export const CLUB_TIMEZONE = "America/Chicago";

export type DurationUnit = "days" | "hours" | "minutes";

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

/** Interpret a wall-clock datetime in America/Chicago as a UTC Date. */
export function chicagoWallToUtc(localIso: string): Date {
  const trimmed = localIso.length === 16 ? `${localIso}:00` : localIso;
  const [datePart, timePart = "00:00:00"] = trimmed.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0));
  const offset = tzOffsetMs(utcGuess, CLUB_TIMEZONE);
  const adjusted = new Date(utcGuess.getTime() - offset);
  const offset2 = tzOffsetMs(adjusted, CLUB_TIMEZONE);
  if (offset2 !== offset) {
    return new Date(utcGuess.getTime() - offset2);
  }
  return adjusted;
}

export function addUnit(from: Date, amount: number, unit: DurationUnit): Date {
  const ms =
    unit === "days" ? amount * 86400000 : unit === "hours" ? amount * 3600000 : amount * 60000;
  return new Date(from.getTime() + ms);
}

export function subtractUnit(from: Date, amount: number, unit: DurationUnit): Date {
  return addUnit(from, -amount, unit);
}

/** YYYY-MM-DD in America/Chicago. */
export function chicagoDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Add calendar days to a YYYY-MM-DD America/Chicago date key. */
export function addChicagoDateKeyDays(dateKey: string, days: number): string {
  const noon = chicagoWallToUtc(`${dateKey}T12:00:00`);
  return chicagoDateKey(new Date(noon.getTime() + days * 86_400_000));
}

/**
 * Build an event end from a clock time on the same America/Chicago day as start.
 * If that instant is not after start (for example 12:00 AM after a 10:00 PM start),
 * roll the end date forward one Chicago calendar day. One rollover only (under 24 hours).
 */
export function resolveWeeklyEndUtc(start: Date, endClockHhmm: string): Date {
  const clock = (endClockHhmm.includes("T") ? endClockHhmm.split("T")[1] : endClockHhmm).slice(0, 5);
  const startDateKey = chicagoDateKey(start);
  let end = chicagoWallToUtc(`${startDateKey}T${clock}`);
  if (end.getTime() <= start.getTime()) {
    const nextKey = addChicagoDateKeyDays(startDateKey, 1);
    end = chicagoWallToUtc(`${nextKey}T${clock}`);
  }
  return end;
}

/** `datetime-local` value (YYYY-MM-DDTHH:mm) in America/Chicago. */
export function chicagoDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function weekdayInChicago(date: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TIMEZONE,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? date.getUTCDay();
}
