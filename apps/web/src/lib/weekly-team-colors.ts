export const WEEKLY_TEAM_COLOR_PRESETS = [
  { label: "Blue", hex: "#2563eb" },
  { label: "Red", hex: "#dc2626" },
  { label: "White", hex: "#ffffff" },
  { label: "Green", hex: "#16a34a" },
  { label: "Yellow", hex: "#eab308" },
  { label: "Orange", hex: "#f97316" },
  { label: "Purple", hex: "#7c3aed" },
  { label: "Pink", hex: "#ec4899" },
] as const;

export const DEFAULT_WEEKLY_TEAMS = [
  { name: "Team Red", color: "#dc2626", sortOrder: 0 },
  { name: "Team Blue", color: "#2563eb", sortOrder: 1 },
] as const;

export function normalizeTeamColor(value: unknown, fallback = "#2563eb"): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function relativeLuminance(hex: string): number {
  const n = normalizeTeamColor(hex);
  const r = Number.parseInt(n.slice(1, 3), 16) / 255;
  const g = Number.parseInt(n.slice(3, 5), 16) / 255;
  const b = Number.parseInt(n.slice(5, 7), 16) / 255;
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function isLightTeamColor(hex: string): boolean {
  return relativeLuminance(hex) > 0.55;
}

/** Dark text on light team colors; white on dark — never white-on-light. */
export function teamContrastText(hex: string): string {
  return isLightTeamColor(hex) ? "#122540" : "#ffffff";
}

export function teamCardBackground(hex: string): string {
  const color = normalizeTeamColor(hex);
  if (isLightTeamColor(color)) {
    return `linear-gradient(160deg, ${color} 0%, ${color} 78%, ${color}cc 100%)`;
  }
  return `linear-gradient(160deg, ${color} 0%, ${color}ee 55%, #0b1220 140%)`;
}

export function teamContrastMuted(hex: string): string {
  return relativeLuminance(hex) > 0.55 ? "rgba(18, 37, 64, 0.72)" : "rgba(255, 255, 255, 0.82)";
}

export type WeeklyTeamPublic = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  members: { userId: string; name: string }[];
};

export type WeeklyTeamsPublicResponse = {
  enabled: boolean;
  locked: boolean;
  announcedAt: string | null;
  teams: WeeklyTeamPublic[];
  unassigned: { userId: string; name: string }[];
  myTeamId: string | null;
  canJoin: boolean;
};
