/** Card label for Manage Events — adminLabel if set, else template title. Client-safe. */
export function weeklySeriesCardTitle(series: {
  title?: string | null;
  adminLabel?: string | null;
}): string {
  const label = typeof series.adminLabel === "string" ? series.adminLabel.trim() : "";
  if (label) return label;
  const title = typeof series.title === "string" ? series.title.trim() : "";
  return title || "Weekly series";
}
