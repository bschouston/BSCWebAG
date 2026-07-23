/**
 * Wall-clock date/time helpers for tournament scheduling.
 * Server runtimes (e.g. Vercel) are typically UTC; venue times must be
 * interpreted in a fixed tournament timezone, not the host's local TZ.
 */

/** BSC / Houston venue default. */
export const DEFAULT_TOURNAMENT_TIMEZONE = "America/Chicago";

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function wallPartsInZone(ms: number, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function asUtcMs(p: WallParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
}

/**
 * Convert a venue wall-clock date + minutes-from-midnight into a UTC Date.
 * Uses Intl so DST in `timeZone` is handled correctly.
 */
export function wallClockToUtcDate(
  scheduleDate: string,
  minutesFromMidnight: number,
  timeZone: string = DEFAULT_TOURNAMENT_TIMEZONE
): Date {
  const [y, mo, d] = scheduleDate.split("-").map(Number);
  if (!y || !mo || !d) {
    throw new Error(`Invalid schedule date "${scheduleDate}". Use YYYY-MM-DD.`);
  }
  if (!Number.isFinite(minutesFromMidnight) || minutesFromMidnight < 0) {
    throw new Error(`Invalid minutes from midnight: ${minutesFromMidnight}`);
  }

  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  if (hour > 23 || minute > 59) {
    throw new Error(`Invalid minutes from midnight: ${minutesFromMidnight}`);
  }

  const desired: WallParts = { year: y, month: mo, day: d, hour, minute };
  let guess = asUtcMs(desired);

  // Iterate: adjust guess so that formatting in `timeZone` yields the desired wall time.
  for (let i = 0; i < 4; i++) {
    const actual = wallPartsInZone(guess, timeZone);
    const delta = asUtcMs(desired) - asUtcMs(actual);
    if (delta === 0) break;
    guess += delta;
  }

  const verified = wallPartsInZone(guess, timeZone);
  if (
    verified.year !== desired.year ||
    verified.month !== desired.month ||
    verified.day !== desired.day ||
    verified.hour !== desired.hour ||
    verified.minute !== desired.minute
  ) {
    throw new Error(
      `Could not resolve ${scheduleDate} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} in ${timeZone}`
    );
  }

  return new Date(guess);
}

/** Convenience: YYYY-MM-DD + HH:mm in a timezone → UTC Date. */
export function wallDateTimeToUtcDate(
  scheduleDate: string,
  hm: string,
  timeZone: string = DEFAULT_TOURNAMENT_TIMEZONE
): Date {
  const m = String(hm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid time "${hm}". Use HH:mm.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`Invalid time "${hm}". Use HH:mm.`);
  }
  return wallClockToUtcDate(scheduleDate, h * 60 + min, timeZone);
}

/** Minutes from midnight of an instant when viewed in `timeZone`. */
export function utcDateToWallMinutes(
  date: Date,
  timeZone: string = DEFAULT_TOURNAMENT_TIMEZONE
): number {
  const p = wallPartsInZone(date.getTime(), timeZone);
  return p.hour * 60 + p.minute;
}
