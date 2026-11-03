import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isShopOpen, loadShopSettings } from "@/lib/shop/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await loadShopSettings(getAdminDb());
    const open = isShopOpen(settings);
    return NextResponse.json({
      settings: {
        shopEnabled: settings.shopEnabled,
        orderOpensAt: settings.orderOpensAt,
        orderClosesAt: settings.orderClosesAt,
        seasonTitle: settings.seasonTitle,
        fulfillmentInstructions: open ? settings.fulfillmentInstructions : settings.fulfillmentInstructions,
      },
      open,
    });
  } catch (err) {
    console.error("GET /api/shop/settings", err);
    return NextResponse.json({ error: "Failed to load shop settings" }, { status: 500 });
  }
}
