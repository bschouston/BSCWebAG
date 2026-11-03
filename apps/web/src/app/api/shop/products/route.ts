import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isShopOpen, loadShopSettings } from "@/lib/shop/settings";
import { serializeProduct } from "@/lib/shop/serialize";
import { variantRemaining, variantUnitPrice } from "@/lib/shop/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const settings = await loadShopSettings(adminDb);
    const open = isShopOpen(settings);
    if (!open) {
      return NextResponse.json({ products: [], open: false, settings });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const size = searchParams.get("size");
    const color = searchParams.get("color");
    const sort = searchParams.get("sort") || "featured";
    const inStockOnly = searchParams.get("inStock") === "1";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    const snap = await adminDb.collection("shopProducts").where("status", "==", "PUBLISHED").get();
    let products = snap.docs.map((d) =>
      serializeProduct(d.id, d.data() as Record<string, unknown>)
    );

    if (category) products = products.filter((p) => p.category === category);
    if (size) {
      products = products.filter((p) =>
        p.variants.some((v) => v.size === size && variantRemaining(v) !== 0)
      );
    }
    if (color) {
      products = products.filter((p) =>
        p.variants.some((v) => v.color === color && variantRemaining(v) !== 0)
      );
    }
    if (inStockOnly) {
      products = products.filter((p) => p.variants.some((v) => variantRemaining(v) !== 0));
    }
    if (minPrice != null && minPrice !== "") {
      const min = Number(minPrice);
      if (Number.isFinite(min)) {
        products = products.filter((p) => {
          const prices = p.variants.map((v) => variantUnitPrice(p, v));
          return Math.min(...prices, p.basePrice) >= min;
        });
      }
    }
    if (maxPrice != null && maxPrice !== "") {
      const max = Number(maxPrice);
      if (Number.isFinite(max)) {
        products = products.filter((p) => {
          const prices = p.variants.map((v) => variantUnitPrice(p, v));
          return Math.min(...prices, p.basePrice) <= max;
        });
      }
    }

    products.sort((a, b) => {
      if (sort === "priceAsc") {
        return (
          Math.min(...a.variants.map((v) => variantUnitPrice(a, v)), a.basePrice) -
          Math.min(...b.variants.map((v) => variantUnitPrice(b, v)), b.basePrice)
        );
      }
      if (sort === "priceDesc") {
        return (
          Math.min(...b.variants.map((v) => variantUnitPrice(b, v)), b.basePrice) -
          Math.min(...a.variants.map((v) => variantUnitPrice(a, v)), a.basePrice)
        );
      }
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return (b.createdAt || "").localeCompare(a.createdAt || "");
      // featured
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });

    return NextResponse.json({ products, open: true, settings });
  } catch (err) {
    console.error("GET /api/shop/products", err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}
