export type TokenTopUpTier = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
  label?: string | null;
  /** Hex background for member wallet buy cards */
  cardColor?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export const DEFAULT_TIER_CARD_COLOR = "#1a3556";

export const TIER_CARD_COLOR_PRESETS = [
  { label: "Navy", value: "#1a3556" },
  { label: "Gold", value: "#FFD700" },
  { label: "Red", value: "#ed1c24" },
  { label: "Teal", value: "#1ea7a0" },
] as const;

export function isTierCardColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function normalizeTierCardColor(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (isTierCardColor(raw)) return raw.toLowerCase();
  return DEFAULT_TIER_CARD_COLOR;
}

/** White text on dark cards, navy on light (e.g. gold). */
export function tierCardForeground(hex: string): string {
  const color = normalizeTierCardColor(hex).slice(1);
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance > 155 ? "#122540" : "#ffffff";
}

export function formatTierPrice(priceCents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `$${(priceCents / 100).toFixed(2)}`;
  }
}
