export const ITS_NUMBER_REGEX = /^\d{8}$/;

/** Normalize raw input to digits-only string (no formatting). */
export function normalizeItsNumber(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidItsNumber(raw: string | null | undefined): boolean {
  return ITS_NUMBER_REGEX.test(normalizeItsNumber(raw));
}

/** Club roles that must claim an ITS# before using the site. */
export function clubRoleNeedsIts(role: string | null | undefined): boolean {
  return role === "MEMBER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/** True when a club-role user has not yet claimed a valid ITS#. */
export function profileNeedsIts(profile: {
  role?: string | null;
  itsNumber?: string | null;
} | null | undefined): boolean {
  if (!profile || !clubRoleNeedsIts(profile.role)) return false;
  return !isValidItsNumber(profile.itsNumber);
}
