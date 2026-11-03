import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_SHOP_SETTINGS,
  type ShopSettings,
} from "@/lib/shop/types";

export const SHOP_SETTINGS_DOC = "shopSettings/config";

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

export function parseShopSettings(data: Record<string, unknown> | undefined | null): ShopSettings {
  if (!data) return { ...DEFAULT_SHOP_SETTINGS };
  return {
    shopEnabled: data.shopEnabled === true,
    orderOpensAt: toIso(data.orderOpensAt),
    orderClosesAt: toIso(data.orderClosesAt),
    seasonTitle: typeof data.seasonTitle === "string" ? data.seasonTitle : "",
    fulfillmentInstructions:
      typeof data.fulfillmentInstructions === "string" ? data.fulfillmentInstructions : "",
  };
}

/** Public shop is open when enabled, instructions set, and now is inside the window (if set). */
export function isShopOpen(settings: ShopSettings, now = new Date()): boolean {
  if (!settings.shopEnabled) return false;
  if (!settings.fulfillmentInstructions.trim()) return false;
  const t = now.getTime();
  if (settings.orderOpensAt) {
    const open = Date.parse(settings.orderOpensAt);
    if (Number.isFinite(open) && t < open) return false;
  }
  if (settings.orderClosesAt) {
    const close = Date.parse(settings.orderClosesAt);
    if (Number.isFinite(close) && t > close) return false;
  }
  return true;
}

export async function loadShopSettings(adminDb: Firestore): Promise<ShopSettings> {
  const snap = await adminDb.doc(SHOP_SETTINGS_DOC).get();
  return parseShopSettings(snap.exists ? (snap.data() as Record<string, unknown>) : null);
}
