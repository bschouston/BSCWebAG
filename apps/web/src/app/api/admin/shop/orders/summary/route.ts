import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { serializeOrder } from "@/lib/shop/serialize";

export const dynamic = "force-dynamic";

type AggregateRow = {
  productId: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  qty: number;
};

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const snap = await getAdminDb().collection("shopOrders").get();
    const paid = snap.docs
      .map((d) => serializeOrder(d.id, d.data() as Record<string, unknown>))
      .filter((o) => o.paymentStatus === "paid");

    const map = new Map<string, AggregateRow>();
    for (const order of paid) {
      for (const line of order.lines) {
        const key = `${line.productId}|${line.size}|${line.color}`;
        const prev = map.get(key);
        if (prev) {
          prev.qty += line.qty;
        } else {
          map.set(key, {
            productId: line.productId,
            name: line.name,
            size: line.size,
            color: line.color,
            sku: line.sku,
            qty: line.qty,
          });
        }
      }
    }

    const rows = [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.size.localeCompare(b.size) || a.color.localeCompare(b.color)
    );

    return NextResponse.json({
      orderCount: paid.length,
      rows,
      totalUnits: rows.reduce((s, r) => s + r.qty, 0),
    });
  } catch (err) {
    console.error("GET /api/admin/shop/orders/summary", err);
    return NextResponse.json({ error: "Failed to build summary" }, { status: 500 });
  }
}
