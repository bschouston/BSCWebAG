import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { publicSiteUrl } from "@/lib/site-url";
import { loadShopSettings } from "@/lib/shop/settings";
import {
  formatCustomization,
  lineUnitAmount,
  type ShopOrderLine,
} from "@/lib/shop/types";
import {
  sendShopOrderCaptureFailedEmail,
  sendShopOrderConfirmedEmail,
  sendShopOrderPlacedEmail,
  sendShopOrderRefundedEmail,
  sendShopOrderReleasedEmail,
  type ShopEmailLine,
} from "@/lib/email";

export type ShopEmailEventKey =
  | "placed"
  | "confirmed"
  | "captureFailed"
  | "released"
  | "refunded";

function linesFromOrder(lines: ShopOrderLine[]): ShopEmailLine[] {
  return lines.map((l) => ({
    name: l.name,
    size: l.size,
    color: l.color,
    qty: l.qty,
    unitAmount: lineUnitAmount(l),
    customizationLabel: formatCustomization(l.customization) || null,
  }));
}

function emailEvents(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.emailEvents;
  if (!raw || typeof raw !== "object") return {};
  return { ...(raw as Record<string, unknown>) };
}

function alreadySent(data: Record<string, unknown>, key: ShopEmailEventKey): boolean {
  const events = emailEvents(data);
  return Boolean(events[key]);
}

async function markEmailSent(orderId: string, key: ShopEmailEventKey): Promise<void> {
  await getAdminDb()
    .collection("shopOrders")
    .doc(orderId)
    .update({
      [`emailEvents.${key}`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

function buyerFrom(data: Record<string, unknown>) {
  return {
    to: String(data.buyerEmail ?? ""),
    name: String(data.buyerName ?? "there"),
    orderId: "",
    total: Number(data.total) || 0,
    lines: linesFromOrder((Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[]),
  };
}

export function shopRepayUrl(orderId: string, repayToken: string): string {
  const base = publicSiteUrl();
  const q = new URLSearchParams({ orderId, token: repayToken });
  return `${base}/shop/checkout/repay?${q.toString()}`;
}

export async function notifyShopOrderPlaced(
  orderId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (alreadySent(data, "placed")) return;
  const to = String(data.buyerEmail ?? "");
  if (!to) return;
  const settings = await loadShopSettings(getAdminDb());
  const base = buyerFrom(data);
  await sendShopOrderPlacedEmail({
    ...base,
    orderId,
    seasonTitle: settings.seasonTitle,
  });
  await markEmailSent(orderId, "placed");
  console.info("shop placement email sent", { orderId, to });
}

export async function notifyShopOrderConfirmed(
  orderId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (alreadySent(data, "confirmed")) return;
  const to = String(data.buyerEmail ?? "");
  if (!to) return;
  const settings = await loadShopSettings(getAdminDb());
  const base = buyerFrom(data);
  await sendShopOrderConfirmedEmail({
    ...base,
    orderId,
    seasonTitle: settings.seasonTitle,
    fulfillmentInstructions: settings.fulfillmentInstructions,
    charged: true,
  });
  await markEmailSent(orderId, "confirmed");
}

export async function notifyShopOrderCaptureFailed(
  orderId: string,
  data: Record<string, unknown>,
  reason: string,
  repayToken: string
): Promise<void> {
  if (alreadySent(data, "captureFailed")) return;
  const to = String(data.buyerEmail ?? "");
  if (!to) return;
  const settings = await loadShopSettings(getAdminDb());
  const base = buyerFrom(data);
  await sendShopOrderCaptureFailedEmail({
    ...base,
    orderId,
    seasonTitle: settings.seasonTitle,
    reason,
    repayUrl: shopRepayUrl(orderId, repayToken),
  });
  await markEmailSent(orderId, "captureFailed");
}

export async function notifyShopOrderReleased(
  orderId: string,
  data: Record<string, unknown>,
  reason?: string | null
): Promise<void> {
  if (alreadySent(data, "released")) return;
  const to = String(data.buyerEmail ?? "");
  if (!to) return;
  const settings = await loadShopSettings(getAdminDb());
  const base = buyerFrom(data);
  await sendShopOrderReleasedEmail({
    ...base,
    orderId,
    seasonTitle: settings.seasonTitle,
    reason: reason ?? null,
  });
  await markEmailSent(orderId, "released");
}

export async function notifyShopOrderRefunded(
  orderId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (alreadySent(data, "refunded")) return;
  const to = String(data.buyerEmail ?? "");
  if (!to) return;
  const settings = await loadShopSettings(getAdminDb());
  const base = buyerFrom(data);
  await sendShopOrderRefundedEmail({
    ...base,
    orderId,
    seasonTitle: settings.seasonTitle,
  });
  await markEmailSent(orderId, "refunded");
}
