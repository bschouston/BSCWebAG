import type { ShopColor, ShopOrder, ShopProduct, ShopVariant } from "@/lib/shop/types";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function slugifyShopName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function serializeProduct(id: string, data: Record<string, unknown>): ShopProduct {
  const colorsRaw = Array.isArray(data.colors) ? data.colors : [];
  const colors: ShopColor[] = colorsRaw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      const hex = typeof o.hex === "string" ? o.hex : "#888888";
      if (!name) return null;
      return { name, hex };
    })
    .filter((c): c is ShopColor => c !== null);

  const variantsRaw = Array.isArray(data.variants) ? data.variants : [];
  const variants: ShopVariant[] = variantsRaw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      if (!id) return null;
      return {
        id,
        size: typeof o.size === "string" ? o.size : "",
        color: typeof o.color === "string" ? o.color : "",
        sku: typeof o.sku === "string" ? o.sku : "",
        orderLimit:
          o.orderLimit === null || o.orderLimit === undefined
            ? null
            : Number.isFinite(Number(o.orderLimit))
              ? Math.max(0, Math.floor(Number(o.orderLimit)))
              : null,
        reservedCount: Math.max(0, Math.floor(Number(o.reservedCount) || 0)),
        price:
          o.price === null || o.price === undefined
            ? null
            : Number.isFinite(Number(o.price))
              ? Number(o.price)
              : null,
      } as ShopVariant;
    })
    .filter((v): v is ShopVariant => v != null);

  const status =
    data.status === "PUBLISHED" || data.status === "ARCHIVED" || data.status === "DRAFT"
      ? data.status
      : "DRAFT";

  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    slug: typeof data.slug === "string" ? data.slug : id,
    description: typeof data.description === "string" ? data.description : "",
    category: typeof data.category === "string" ? data.category : "Other",
    images: Array.isArray(data.images)
      ? data.images.filter((u): u is string => typeof u === "string")
      : [],
    basePrice: Number.isFinite(Number(data.basePrice)) ? Number(data.basePrice) : 0,
    sizes: Array.isArray(data.sizes)
      ? data.sizes.filter((s): s is string => typeof s === "string")
      : [],
    colors,
    variants,
    status,
    featured: data.featured === true,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function serializeOrder(id: string, data: Record<string, unknown>): ShopOrder {
  const linesRaw = Array.isArray(data.lines) ? data.lines : [];
  const lines = linesRaw
    .map((l) => {
      if (!l || typeof l !== "object") return null;
      const o = l as Record<string, unknown>;
      return {
        productId: String(o.productId ?? ""),
        variantId: String(o.variantId ?? ""),
        name: String(o.name ?? ""),
        size: String(o.size ?? ""),
        color: String(o.color ?? ""),
        sku: String(o.sku ?? ""),
        qty: Math.max(1, Math.floor(Number(o.qty) || 1)),
        unitPrice: Number(o.unitPrice) || 0,
        image: typeof o.image === "string" ? o.image : null,
      };
    })
    .filter(Boolean) as ShopOrder["lines"];

  const paymentStatus =
    data.paymentStatus === "paid" ||
    data.paymentStatus === "released" ||
    data.paymentStatus === "refunded" ||
    data.paymentStatus === "authorized"
      ? data.paymentStatus
      : "authorized";

  const fulfillmentStatus =
    data.fulfillmentStatus === "ready" ||
    data.fulfillmentStatus === "picked_up" ||
    data.fulfillmentStatus === "rejected" ||
    data.fulfillmentStatus === "cancelled" ||
    data.fulfillmentStatus === "pending_review"
      ? data.fulfillmentStatus
      : "pending_review";

  return {
    id,
    buyerName: String(data.buyerName ?? ""),
    buyerEmail: String(data.buyerEmail ?? ""),
    buyerPhone: String(data.buyerPhone ?? ""),
    lines,
    subtotal: Number(data.subtotal) || 0,
    total: Number(data.total) || 0,
    paymentStatus,
    fulfillmentStatus,
    stripeSessionId: String(data.stripeSessionId ?? ""),
    stripePaymentIntentId:
      typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null,
    stripeLivemode: data.stripeLivemode === true,
    stripeRefundId: typeof data.stripeRefundId === "string" ? data.stripeRefundId : null,
    captureError: typeof data.captureError === "string" ? data.captureError : null,
    createdAt: toIso(data.createdAt),
    reviewedAt: toIso(data.reviewedAt),
    pickedUpAt: toIso(data.pickedUpAt),
  };
}
