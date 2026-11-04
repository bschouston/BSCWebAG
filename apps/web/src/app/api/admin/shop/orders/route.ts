import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { serializeOrder } from "@/lib/shop/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const adminDb = getAdminDb();
    let snap;
    try {
      snap = await adminDb.collection("shopOrders").orderBy("createdAt", "desc").limit(200).get();
    } catch {
      snap = await adminDb.collection("shopOrders").limit(200).get();
    }
    const orders = snap.docs
      .map((d) => serializeOrder(d.id, d.data() as Record<string, unknown>))
      // Abandoned Stripe checkouts never authorized — hide from Manage Shop.
      .filter((o) => o.paymentStatus !== "pending_checkout")
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return NextResponse.json({ orders });
  } catch (err) {
    console.error("GET /api/admin/shop/orders", err);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
