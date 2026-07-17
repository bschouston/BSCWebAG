/** Normalize a title or raw slug into a URL-safe event slug. */
export function slugifyEventTitle(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

/** True when slug is non-empty and only contains lowercase letters, digits, and hyphens. */
export function isValidEventSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Resolve the slug to persist: prefer an explicit slug (normalized),
 * otherwise derive from title. Returns empty string if neither yields a value.
 */
export function resolveEventSlug(
  slug: string | null | undefined,
  title: string | null | undefined
): string {
  const fromSlug = slugifyEventTitle(String(slug ?? ""));
  if (fromSlug) return fromSlug;
  return slugifyEventTitle(String(title ?? ""));
}
