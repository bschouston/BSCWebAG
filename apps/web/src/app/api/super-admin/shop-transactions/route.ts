import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { getStripe, stripeModeFromLivemode } from "@/lib/stripe-wallet";
import { serializeOrder } from "@/lib/shop/serialize";
import { releaseVariants } from "@/lib/shop/inventory";
import type { ShopOrderLine } from "@/lib/shop/types";

export const dynamic = "force-dynamic";

async function syncExpiredAuth(orderId: string, data: Record<string, unknown>) {
  if (data.paymentStatus !== "authorized") return data;
  const piId = typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
  if (!piId) return data;
  try {
    const stripe = getStripe(stripeModeFromLivemode(data.stripeLivemode === true));
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status === "canceled") {
      const lines = (Array.isArray(data.lines) ? data.lines : []) as ShopOrderLine[];
      await releaseVariants(getAdminDb(), lines);
      await getAdminDb().collection("shopOrders").doc(orderId).update({
        paymentStatus: "released",
        fulfillmentStatus: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
      });
      const released = {
        ...data,
        paymentStatus: "released",
        fulfillmentStatus: "cancelled",
      };
      const { notifyShopOrderReleased } = await import("@/lib/shop/order-emails");
      try {
        await notifyShopOrderReleased(
          orderId,
          released,
          "Card authorization expired before confirmation"
        );
      } catch (e) {
        console.error("shop expired-auth email:", e);
      }
      return released;
    }
  } catch (err) {
    console.warn("shop tx sync PI", piId, err);
  }
  return data;
}

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;
  try {
    const adminDb = getAdminDb();
    let snap;
    try {
      snap = await adminDb.collection("shopOrders").orderBy("createdAt", "desc").limit(200).get();
    } catch {
      snap = await adminDb.collection("shopOrders").limit(200).get();
    }

    const transactions = [];
    for (const doc of snap.docs) {
      let data = doc.data() as Record<string, unknown>;
      // Skip abandoned checkout sessions that never authorized
      if (data.paymentStatus === "pending_checkout") continue;
      data = await syncExpiredAuth(doc.id, data);
      transactions.push(serializeOrder(doc.id, data));
    }

    transactions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return NextResponse.json({ transactions });
  } catch (err) {
    console.error("GET /api/super-admin/shop-transactions", err);
    return NextResponse.json({ error: "Failed to load shop transactions" }, { status: 500 });
  }
}
