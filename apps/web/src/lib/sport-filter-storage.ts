export function loadSportFilter(keyPrefix: string, userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${keyPrefix}.${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

export function saveSportFilter(keyPrefix: string, userId: string, sportIds: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${keyPrefix}.${userId}`, JSON.stringify(sportIds));
}

export function sportFilterLabel(
  sportId: string,
  sports: { slug: string; id: string; label: string }[]
) {
  return (
    sports.find((s) => s.slug === sportId || s.id === sportId)?.label ||
    sportId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function sortSportFilterIds(
  ids: string[],
  sports: { slug: string; id: string; label: string }[]
) {
  const order = new Map(sports.map((s, i) => [s.slug, i]));
  return [...ids].sort((a, b) => {
    const ao = order.get(a) ?? 999;
    const bo = order.get(b) ?? 999;
    if (ao !== bo) return ao - bo;
    return sportFilterLabel(a, sports).localeCompare(sportFilterLabel(b, sports));
  });
}
