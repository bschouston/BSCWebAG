import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { serializeOrder } from "@/lib/shop/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Admin may only update handout status on paid orders. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const fulfillmentStatus = body.fulfillmentStatus;
    if (fulfillmentStatus !== "ready" && fulfillmentStatus !== "picked_up") {
      return NextResponse.json(
        { error: "Admin may only set ready or picked_up" },
        { status: 400 }
      );
    }

    const ref = getAdminDb().collection("shopOrders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (data.paymentStatus !== "paid") {
      return NextResponse.json(
        { error: "Only paid orders can be marked for handout" },
        { status: 400 }
      );
    }

    await ref.update({
      fulfillmentStatus,
      ...(fulfillmentStatus === "picked_up"
        ? { pickedUpAt: FieldValue.serverTimestamp() }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const next = await ref.get();
    return NextResponse.json({
      order: serializeOrder(next.id, next.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("PATCH /api/admin/shop/orders/[id]", err);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
