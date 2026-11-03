import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { loadShopSettings, SHOP_SETTINGS_DOC } from "@/lib/shop/settings";

export const dynamic = "force-dynamic";

function parseOptionalIso(value: unknown): Timestamp | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Timestamp.fromDate(new Date(ms));
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const settings = await loadShopSettings(getAdminDb());
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("GET /api/admin/shop/settings", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const body = await request.json();
    const shopEnabled = body.shopEnabled === true;
    const seasonTitle = typeof body.seasonTitle === "string" ? body.seasonTitle.trim() : "";
    const fulfillmentInstructions =
      typeof body.fulfillmentInstructions === "string"
        ? body.fulfillmentInstructions.trim()
        : "";

    if (shopEnabled && !fulfillmentInstructions) {
      return NextResponse.json(
        { error: "Fulfillment instructions are required before enabling the shop" },
        { status: 400 }
      );
    }

    const orderOpensAt = parseOptionalIso(body.orderOpensAt);
    const orderClosesAt = parseOptionalIso(body.orderClosesAt);
    if (orderOpensAt && orderClosesAt && orderClosesAt.toMillis() < orderOpensAt.toMillis()) {
      return NextResponse.json(
        { error: "Order close must be after order open" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    await adminDb.doc(SHOP_SETTINGS_DOC).set(
      {
        shopEnabled,
        seasonTitle,
        fulfillmentInstructions,
        orderOpensAt,
        orderClosesAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const settings = await loadShopSettings(adminDb);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("PATCH /api/admin/shop/settings", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
