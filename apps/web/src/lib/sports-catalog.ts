export type CatalogItem = {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  active: boolean;
};

export const DEFAULT_SPORTS: Omit<CatalogItem, "id">[] = [
  { slug: "american_football", label: "American Football", sortOrder: 10, active: true },
  { slug: "badminton", label: "Badminton", sortOrder: 20, active: true },
  { slug: "basketball", label: "Basketball", sortOrder: 30, active: true },
  { slug: "cricket", label: "Cricket", sortOrder: 40, active: true },
  { slug: "one_touch_volleyball", label: "One-Touch Volleyball", sortOrder: 50, active: true },
  { slug: "pickleball", label: "Pickleball", sortOrder: 60, active: true },
  { slug: "soccer", label: "Soccer", sortOrder: 70, active: true },
  { slug: "table_tennis", label: "Table Tennis", sortOrder: 80, active: true },
  { slug: "throwball", label: "Throwball", sortOrder: 90, active: true },
  { slug: "volleyball", label: "Volleyball", sortOrder: 100, active: true },
];

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

export function parseCatalogItem(id: string, data: Record<string, unknown>): CatalogItem {
  return {
    id,
    slug: typeof data.slug === "string" && data.slug ? data.slug : id,
    label: typeof data.label === "string" ? data.label : id,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    active: data.active !== false,
  };
}
