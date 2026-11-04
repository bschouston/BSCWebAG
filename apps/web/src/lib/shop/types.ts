export const SHOP_CATEGORIES = [
  "Tops",
  "Bottoms",
  "Outerwear",
  "Headwear",
  "Accessories",
  "Other",
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export type ShopProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ShopPaymentStatus =
  | "pending_checkout"
  | "authorized"
  | "paid"
  | "released"
  | "refunded"
  | "capture_failed"
  | "pending_repay";

export type ShopFulfillmentStatus =
  | "pending_review"
  | "ready"
  | "picked_up"
  | "rejected"
  | "cancelled";

export type ShopColor = { name: string; hex: string };

export type ShopVariant = {
  id: string;
  size: string;
  color: string;
  sku: string;
  /** Max units for this variant; null = unlimited */
  orderLimit: number | null;
  /** Units reserved by authorized (not yet captured) + paid orders */
  reservedCount: number;
  /** Optional per-variant price; falls back to product basePrice */
  price: number | null;
};

/** Per-product apparel personalization (name/number) for an extra fee. */
export type ShopCustomizationConfig = {
  enabled: boolean;
  /** Extra USD charged per unit when the buyer personalizes */
  fee: number;
  label: string;
  helpText: string;
  requireName: boolean;
  requireNumber: boolean;
  nameMaxLength: number;
  numberMin: number;
  numberMax: number;
};

export type ShopLineCustomization = {
  jerseyName: string;
  jerseyNumber: string;
};

export const DEFAULT_SHOP_CUSTOMIZATION: ShopCustomizationConfig = {
  enabled: false,
  fee: 10,
  label: "Add name & number",
  helpText: "Printed on the jersey. Letters and numbers only.",
  requireName: true,
  requireNumber: true,
  nameMaxLength: 12,
  numberMin: 0,
  numberMax: 99,
};

export type ShopProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  images: string[];
  basePrice: number;
  sizes: string[];
  colors: ShopColor[];
  variants: ShopVariant[];
  customization: ShopCustomizationConfig;
  status: ShopProductStatus;
  featured: boolean;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ShopOrderLine = {
  productId: string;
  variantId: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  qty: number;
  /** Garment unit price (before personalization fee) */
  unitPrice: number;
  /** Personalization fee per unit at order time */
  customizationFee: number;
  customization: ShopLineCustomization | null;
  image?: string | null;
};

export type ShopOrder = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  lines: ShopOrderLine[];
  subtotal: number;
  total: number;
  paymentStatus: ShopPaymentStatus;
  fulfillmentStatus: ShopFulfillmentStatus;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  stripeLivemode: boolean;
  stripeRefundId?: string | null;
  captureError?: string | null;
  createdAt?: string | null;
  reviewedAt?: string | null;
  pickedUpAt?: string | null;
};

export type ShopSettings = {
  shopEnabled: boolean;
  orderOpensAt: string | null;
  orderClosesAt: string | null;
  seasonTitle: string;
  fulfillmentInstructions: string;
};

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  shopEnabled: false,
  orderOpensAt: null,
  orderClosesAt: null,
  seasonTitle: "",
  fulfillmentInstructions: "",
};

export function variantUnitPrice(
  product: { basePrice: number },
  variant: { price?: number | null }
): number {
  if (typeof variant.price === "number" && Number.isFinite(variant.price) && variant.price >= 0) {
    return variant.price;
  }
  return product.basePrice;
}

export function variantRemaining(variant: ShopVariant): number | null {
  if (variant.orderLimit == null) return null;
  return Math.max(0, variant.orderLimit - (variant.reservedCount || 0));
}

export function variantAvailable(variant: ShopVariant, qty = 1): boolean {
  const rem = variantRemaining(variant);
  if (rem == null) return true;
  return rem >= qty;
}

/** Size-only products omit color; used in bag, Stripe line items, admin labels. */
export function formatVariantOptions(size: string, color?: string | null): string {
  const c = (color ?? "").trim();
  return c ? `${size} / ${c}` : size;
}

export function productHasColors(product: { colors?: ShopColor[]; variants?: ShopVariant[] }): boolean {
  if (Array.isArray(product.colors) && product.colors.length > 0) return true;
  return (product.variants ?? []).some((v) => (v.color ?? "").trim().length > 0);
}

export function lineUnitAmount(line: {
  unitPrice: number;
  customizationFee?: number | null;
}): number {
  const fee =
    typeof line.customizationFee === "number" && Number.isFinite(line.customizationFee)
      ? Math.max(0, line.customizationFee)
      : 0;
  return line.unitPrice + fee;
}

export function formatCustomization(c?: ShopLineCustomization | null): string {
  if (!c) return "";
  const name = (c.jerseyName ?? "").trim();
  const num = (c.jerseyNumber ?? "").trim();
  const parts: string[] = [];
  if (name) parts.push(name);
  if (num) parts.push(`#${num}`);
  return parts.join(" ");
}

export function customizationLineKey(c?: ShopLineCustomization | null): string {
  if (!c) return "";
  return `${(c.jerseyName ?? "").trim().toUpperCase()}|${(c.jerseyNumber ?? "").trim()}`;
}
