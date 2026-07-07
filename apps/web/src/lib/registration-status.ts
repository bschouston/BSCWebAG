/** Normalize registration status strings from Firestore / legacy data. */
export function normalizeRegistrationStatus(status?: string | null): string {
  return String(status ?? "").toUpperCase().trim();
}

export function registrationIsWaitlisted(reg: {
  status?: string | null;
  paymentStatus?: string | null;
}): boolean {
  const status = normalizeRegistrationStatus(reg.status);
  if (status === "WAITLISTED" || status === "WAITLIST") return true;
  if (status === "CONFIRMED" || status === "CANCELLED") return false;
  const payment = String(reg.paymentStatus ?? "").toLowerCase();
  return payment === "waitlisted_no_payment" || payment.includes("waitlist");
}

export function registrationIsCancelled(reg: { status?: string | null }): boolean {
  return normalizeRegistrationStatus(reg.status) === "CANCELLED";
}

/** Confirmed registrations — includes admin-confirmed rows regardless of payment. */
export function registrationIsConfirmed(reg: {
  status?: string | null;
  paymentStatus?: string | null;
}): boolean {
  const status = normalizeRegistrationStatus(reg.status);
  if (status === "CONFIRMED") return true;
  if (status === "WAITLISTED" || status === "WAITLIST" || status === "CANCELLED") return false;
  const payment = String(reg.paymentStatus ?? "").toLowerCase();
  return payment === "paid" || payment === "partial";
}

/** Show on public roster and admin lists (confirmed + waitlist, not cancelled/archived/draft). */
export function registrationIsVisibleOnRoster(reg: {
  status?: string | null;
  paymentStatus?: string | null;
  isDraft?: boolean;
  archivedAt?: unknown;
}): boolean {
  if (reg.isDraft || reg.archivedAt) return false;
  if (registrationIsCancelled(reg)) return false;
  return registrationIsConfirmed(reg) || registrationIsWaitlisted(reg);
}

/** Include in tournament player pool (confirmed only). */
export function registrationBelongsInTournament(reg: {
  status?: string | null;
  paymentStatus?: string | null;
  isDraft?: boolean;
  archivedAt?: unknown;
}): boolean {
  if (reg.isDraft || reg.archivedAt) return false;
  if (registrationIsCancelled(reg)) return false;
  return registrationIsConfirmed(reg);
}
