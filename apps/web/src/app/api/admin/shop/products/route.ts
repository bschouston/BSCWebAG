import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { serializeProduct, slugifyShopName } from "@/lib/shop/serialize";
import type { ShopColor, ShopVariant } from "@/lib/shop/types";

export const dynamic = "force-dynamic";

function normalizeVariants(raw: unknown, sizes: string[], colors: ShopColor[]): ShopVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      const size = typeof o.size === "string" ? o.size : "";
      const color = typeof o.color === "string" ? o.color : "";
      if (!size || !color) return null;
      if (sizes.length && !sizes.includes(size)) return null;
      if (colors.length && !colors.some((c) => c.name === color)) return null;
      const id =
        typeof o.id === "string" && o.id
          ? o.id
          : `${size}-${color}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return {
        id,
        size,
        color,
        sku: typeof o.sku === "string" ? o.sku : id.toUpperCase(),
        orderLimit:
          o.orderLimit === null || o.orderLimit === undefined || o.orderLimit === ""
            ? null
            : Math.max(0, Math.floor(Number(o.orderLimit))),
        reservedCount: Math.max(0, Math.floor(Number(o.reservedCount) || 0)),
        price:
          o.price === null || o.price === undefined || o.price === ""
            ? null
            : Number(o.price),
      } as ShopVariant;
    })
    .filter((v): v is ShopVariant => v != null);
}

function normalizeColors(raw: unknown): ShopColor[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) return null;
      const hex =
        typeof o.hex === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(o.hex)
          ? o.hex
          : "#888888";
      return { name, hex };
    })
    .filter((c): c is ShopColor => c !== null);
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("shopProducts").orderBy("sortOrder", "asc").get();
    const products = snap.docs.map((d) => serializeProduct(d.id, d.data() as Record<string, unknown>));
    return NextResponse.json({ products });
  } catch (err) {
    console.error("GET /api/admin/shop/products", err);
    // Fallback without index
    try {
      const snap = await getAdminDb().collection("shopProducts").get();
      const products = snap.docs
        .map((d) => serializeProduct(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      return NextResponse.json({ products });
    } catch (err2) {
      console.error("GET shop products fallback", err2);
      return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
    }
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const slugInput = typeof body.slug === "string" ? body.slug.trim() : "";
    const slug = slugifyShopName(slugInput || name) || `product-${Date.now()}`;
    const basePrice = Number(body.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json({ error: "Invalid base price" }, { status: 400 });
    }

    const sizes = Array.isArray(body.sizes)
      ? body.sizes.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    const colors = normalizeColors(body.colors);
    const variants = normalizeVariants(body.variants, sizes, colors);
    const status =
      body.status === "PUBLISHED" || body.status === "ARCHIVED" || body.status === "DRAFT"
        ? body.status
        : "DRAFT";

    const adminDb = getAdminDb();
    const ref = adminDb.collection("shopProducts").doc();
    const doc = {
      name,
      slug,
      description: typeof body.description === "string" ? body.description : "",
      category: typeof body.category === "string" ? body.category : "Other",
      images: Array.isArray(body.images)
        ? body.images.filter((u: unknown): u is string => typeof u === "string")
        : [],
      basePrice,
      sizes,
      colors,
      variants,
      status,
      featured: body.featured === true,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(doc);
    const snap = await ref.get();
    return NextResponse.json({
      product: serializeProduct(ref.id, snap.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("POST /api/admin/shop/products", err);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
