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
  // WCAG relative luminance.
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.4 ? "#0a0a0a" : "#ffffff";
}

/** Same readable color with reduced alpha, for secondary text on colored backgrounds. */
export function readableMutedTextColor(hexBackground: string | null | undefined): string {
  return readableTextColor(hexBackground) === "#ffffff"
    ? "rgba(255,255,255,0.75)"
    : "rgba(10,10,10,0.65)";
}
