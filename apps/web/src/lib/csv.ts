/** Escape a single CSV cell (RFC-style quoting). */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** Join rows into a CSV string (includes trailing newline). */
export function rowsToCsv(rows: unknown[][]): string {
  return rows.map((r) => csvRow(r)).join("\r\n") + "\r\n";
}

/** Trigger a browser download of CSV content. */
export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Safe filename fragment from an event title. */
export function slugForFilename(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "event";
}
