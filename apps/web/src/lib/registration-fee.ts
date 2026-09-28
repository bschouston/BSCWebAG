import type { RegistrationFee } from "@/types";
import { chicagoDateKey } from "@/lib/chicago-time";

/** Inclusive Chicago calendar day for fee tier cutoff (`YYYY-MM-DD`). */
export function feeValidUntilYmd(validUntil: string | null | undefined): string | null {
  if (typeof validUntil !== "string") return null;
  const trimmed = validUntil.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Pick the current registration fee from an ordered list of tiers.
 * Walks in admin order; first tier with no validUntil or today <= validUntil wins.
 * If all dated tiers are expired, uses the last tier (catch-all).
 */
export function resolveEffectiveRegistrationFee(
  fees: RegistrationFee[] | null | undefined,
  now: Date = new Date()
): RegistrationFee | null {
  if (!Array.isArray(fees) || fees.length === 0) return null;

  const today = chicagoDateKey(now);

  for (const fee of fees) {
    const until = feeValidUntilYmd(fee.validUntil);
    if (!until || today <= until) {
      return fee;
    }
  }

  return fees[fees.length - 1] ?? null;
}

export function registrationFeeAmount(
  fees: RegistrationFee[] | null | undefined,
  now: Date = new Date()
): number | null {
  const fee = resolveEffectiveRegistrationFee(fees, now);
  if (!fee || fee.amount == null) return null;
  const n = Number(fee.amount);
  return Number.isFinite(n) ? n : null;
}

/** Stripe / receipt label: `Event Title - Early Bird`. */
export function registrationStripeName(
  eventTitle: string,
  fee: RegistrationFee | null | undefined
): string {
  const title = (eventTitle || "").trim() || "Registration";
  const tier = typeof fee?.type === "string" ? fee.type.trim() : "";
  return tier ? `${title} - ${tier}` : title;
}

/** Prefer paid/stored amount on a registration; else resolve current fee (for unpaid reminders). */
export function registrationDisplayAmount(opts: {
  registrationAmount?: unknown;
  amountPaid?: unknown;
  fees?: RegistrationFee[] | null | undefined;
}): number | undefined {
  const fromPaid = Number(opts.amountPaid);
  if (Number.isFinite(fromPaid) && fromPaid > 0) return fromPaid;
  const fromReg = Number(opts.registrationAmount);
  if (Number.isFinite(fromReg) && fromReg > 0) return fromReg;
  const resolved = registrationFeeAmount(opts.fees);
  return resolved ?? undefined;
}
