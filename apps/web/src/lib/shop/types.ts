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

export type ShopPaymentStatus = "authorized" | "paid" | "released" | "refunded";

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
  unitPrice: number;
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
