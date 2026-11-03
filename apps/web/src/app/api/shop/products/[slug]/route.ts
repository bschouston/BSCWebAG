import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isShopOpen, loadShopSettings } from "@/lib/shop/settings";
import { serializeProduct } from "@/lib/shop/serialize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const adminDb = getAdminDb();
    const settings = await loadShopSettings(adminDb);
    const open = isShopOpen(settings);

    let snap = await adminDb.collection("shopProducts").where("slug", "==", slug).limit(1).get();
    if (snap.empty) {
      // allow id lookup
      const byId = await adminDb.collection("shopProducts").doc(slug).get();
      if (!byId.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const product = serializeProduct(byId.id, byId.data() as Record<string, unknown>);
      if (product.status !== "PUBLISHED" || !open) {
        return NextResponse.json({ error: "Not available", open }, { status: 404 });
      }
      return NextResponse.json({ product, open, settings });
    }

    const doc = snap.docs[0]!;
    const product = serializeProduct(doc.id, doc.data() as Record<string, unknown>);
    if (product.status !== "PUBLISHED" || !open) {
      return NextResponse.json({ error: "Not available", open }, { status: 404 });
    }
    return NextResponse.json({ product, open, settings });
  } catch (err) {
    console.error("GET /api/shop/products/[slug]", err);
    return NextResponse.json({ error: "Failed to load product" }, { status: 500 });
  }
}
