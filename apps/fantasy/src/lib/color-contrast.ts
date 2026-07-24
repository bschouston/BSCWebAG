/** Pick readable text color (near-black or white) for a hex background. */
export function readableTextColor(hexBackground: string | null | undefined): string {
  const hex = String(hexBackground ?? "").trim();
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return "#0a0a0a";

  const value = match[1];
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.4 ? "#0a0a0a" : "#ffffff";
}

/** Normalize stored team colors to #rrggbb when possible. */
export function normalizeHexColor(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (match) return `#${match[1].toLowerCase()}`;
  const short = value.match(/^#?([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value.startsWith("#") || value.startsWith("rgb") ? value : null;
}
