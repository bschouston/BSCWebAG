/** Display name for member dashboard headers. */
export function memberFullName(opts: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const fromProfile = [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim();
  if (fromProfile) return fromProfile;
  const display = opts.displayName?.trim();
  if (display) return display;
  return "Member";
}

export function memberAreaTitle(name: string, area: string): string {
  return `${name}'s ${area}`;
}
