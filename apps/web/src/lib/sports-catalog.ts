export type CatalogItem = {
  id: string;
  slug: string;
  label: string;
  /** Sports only; skill levels leave unset. */
  emoji?: string | null;
  sortOrder: number;
  active: boolean;
};

export const DEFAULT_SPORTS: Omit<CatalogItem, "id">[] = [
  { slug: "american_football", label: "American Football", emoji: "🏈", sortOrder: 10, active: true },
  { slug: "badminton", label: "Badminton", emoji: "🏸", sortOrder: 20, active: true },
  { slug: "basketball", label: "Basketball", emoji: "🏀", sortOrder: 30, active: true },
  { slug: "cricket", label: "Cricket", emoji: "🏏", sortOrder: 40, active: true },
  { slug: "one_touch_volleyball", label: "One-Touch Volleyball", emoji: "🏐", sortOrder: 50, active: true },
  { slug: "pickleball", label: "Pickleball", emoji: "🏓", sortOrder: 60, active: true },
  { slug: "soccer", label: "Soccer", emoji: "⚽", sortOrder: 70, active: true },
  { slug: "table_tennis", label: "Table Tennis", emoji: "🏓", sortOrder: 80, active: true },
  { slug: "throwball", label: "Throwball", emoji: "🤾", sortOrder: 90, active: true },
  { slug: "volleyball", label: "Volleyball", emoji: "🏐", sortOrder: 100, active: true },
];

const DEFAULT_EMOJI_BY_SLUG: Record<string, string> = Object.fromEntries(
  DEFAULT_SPORTS.map((s) => [s.slug, s.emoji || "🏅"])
);

export const DEFAULT_SKILL_LEVELS: Omit<CatalogItem, "id">[] = [
  { slug: "beginner", label: "Beginner", sortOrder: 10, active: true },
  { slug: "intermediate", label: "Intermediate", sortOrder: 20, active: true },
  { slug: "advanced", label: "Advanced", sortOrder: 30, active: true },
  { slug: "competitive", label: "Competitive", sortOrder: 40, active: true },
];

export function slugifyCatalogLabel(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function normalizeSportEmoji(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 16) : null;
}

/** Display emoji for a sport: saved value, then default by slug, then medal. */
export function sportEmoji(sport: Pick<CatalogItem, "slug" | "emoji">): string {
  const saved = normalizeSportEmoji(sport.emoji);
  if (saved) return saved;
  return DEFAULT_EMOJI_BY_SLUG[sport.slug] || "🏅";
}

export function parseCatalogItem(id: string, data: Record<string, unknown>): CatalogItem {
  return {
    id,
    slug: typeof data.slug === "string" && data.slug ? data.slug : id,
    label: typeof data.label === "string" ? data.label : id,
    emoji: normalizeSportEmoji(data.emoji),
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    active: data.active !== false,
  };
}
