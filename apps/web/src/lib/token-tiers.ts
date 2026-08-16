export type TokenTopUpTier = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
  label?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

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
