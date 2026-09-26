/** Weekly event token hold limits (whole tokens). Shared by admin UI, APIs, and RSVP. */
export const WEEKLY_TOKEN_HOLD_MIN = 0;
export const WEEKLY_TOKEN_HOLD_MAX = 30;

/** Parse and validate a weekly hold field; throws Error with a client-safe message. */
export function parseWeeklyTokenHold(
  value: unknown,
  fieldLabel: string
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < WEEKLY_TOKEN_HOLD_MIN) {
    throw new Error(`${fieldLabel} must be an integer ≥ ${WEEKLY_TOKEN_HOLD_MIN}`);
  }
  if (n > WEEKLY_TOKEN_HOLD_MAX) {
    throw new Error(`${fieldLabel} cannot exceed ${WEEKLY_TOKEN_HOLD_MAX} tokens`);
  }
  return n;
}
