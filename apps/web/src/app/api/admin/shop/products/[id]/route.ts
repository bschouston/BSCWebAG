import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { serializeProduct, slugifyShopName } from "@/lib/shop/serialize";
import type { ShopColor, ShopVariant } from "@/lib/shop/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

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

function normalizeVariants(
  raw: unknown,
  sizes: string[],
  colors: ShopColor[],
  existing: ShopVariant[]
): ShopVariant[] {
  if (!Array.isArray(raw)) return existing;
  const existingById = new Map(existing.map((v) => [v.id, v]));
  return raw
    .map((v) => {
      if (!v || typeof v !== "object") return null;
      const o = v as Record<string, unknown>;
      const size = typeof o.size === "string" ? o.size : "";
      const color = typeof o.color === "string" ? o.color : "";
      if (!size || !color) return null;
      const id =
        typeof o.id === "string" && o.id
          ? o.id
          : `${size}-${color}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const prev = existingById.get(id);
      return {
        id,
        size,
        color,
        sku: typeof o.sku === "string" ? o.sku : id.toUpperCase(),
        orderLimit:
          o.orderLimit === null || o.orderLimit === undefined || o.orderLimit === ""
            ? null
            : Math.max(0, Math.floor(Number(o.orderLimit))),
        reservedCount:
          o.reservedCount !== undefined
            ? Math.max(0, Math.floor(Number(o.reservedCount) || 0))
            : prev?.reservedCount ?? 0,
        price:
          o.price === null || o.price === undefined || o.price === ""
            ? null
            : Number(o.price),
      } as ShopVariant;
    })
    .filter((v): v is ShopVariant => v != null);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await ctx.params;
  const snap = await getAdminDb().collection("shopProducts").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    product: serializeProduct(snap.id, snap.data() as Record<string, unknown>),
  });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("shopProducts").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = serializeProduct(snap.id, snap.data() as Record<string, unknown>);
    const body = await request.json();

    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugifyShopName(body.slug.trim())
        : existing.slug;
    const basePrice =
      body.basePrice !== undefined ? Number(body.basePrice) : existing.basePrice;
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json({ error: "Invalid base price" }, { status: 400 });
    }

    const sizes = Array.isArray(body.sizes)
      ? body.sizes.filter((s: unknown): s is string => typeof s === "string" && !!s.trim())
      : existing.sizes;
    const colors = body.colors !== undefined ? normalizeColors(body.colors) : existing.colors;
    const variants =
      body.variants !== undefined
        ? normalizeVariants(body.variants, sizes, colors, existing.variants)
        : existing.variants;

    const status =
      body.status === "PUBLISHED" || body.status === "ARCHIVED" || body.status === "DRAFT"
        ? body.status
        : existing.status;

    await ref.update({
      name,
      slug,
      description:
        typeof body.description === "string" ? body.description : existing.description,
      category: typeof body.category === "string" ? body.category : existing.category,
      images: Array.isArray(body.images)
        ? body.images.filter((u: unknown): u is string => typeof u === "string")
        : existing.images,
      basePrice,
      sizes,
      colors,
      variants,
      status,
      featured: body.featured !== undefined ? body.featured === true : existing.featured,
      sortOrder:
        body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
          ? Number(body.sortOrder)
          : existing.sortOrder,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const next = await ref.get();
    return NextResponse.json({
      product: serializeProduct(next.id, next.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("PATCH /api/admin/shop/products/[id]", err);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await ctx.params;
  const ref = getAdminDb().collection("shopProducts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft-archive instead of hard delete when reservations exist
  const product = serializeProduct(snap.id, snap.data() as Record<string, unknown>);
  const reserved = product.variants.some((v) => (v.reservedCount || 0) > 0);
  if (reserved) {
    await ref.update({ status: "ARCHIVED", updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ archived: true });
  }
  await ref.delete();
  return NextResponse.json({ deleted: true });
}
