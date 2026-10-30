const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accept a #rgb or #rrggbb section color. Anything else is ignored. */
export function normalizeSectionColor(value: string | undefined | null): string | undefined {
  const raw = value?.trim() ?? "";
  if (!HEX.test(raw)) return undefined;
  return raw.toLowerCase();
}

/** Tint a card with the section color while keeping theme text readable. */
export function sectionTintStyle(
  color: string | undefined | null
): { backgroundColor: string; boxShadow: string } | undefined {
  const safe = normalizeSectionColor(color);
  if (!safe) return undefined;
  return {
    backgroundColor: `color-mix(in srgb, ${safe} 18%, var(--card))`,
    boxShadow: `inset 0 4px 0 0 ${safe}`,
  };
}
