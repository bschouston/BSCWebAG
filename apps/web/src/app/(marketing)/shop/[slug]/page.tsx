"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ShopProduct, ShopSettings } from "@/lib/shop/types";
import { variantAvailable, variantRemaining, variantUnitPrice } from "@/lib/shop/types";
import { useShopCart } from "@/lib/shop-cart-context";
import { Button } from "@/components/ui/button";

export default function ShopProductPage() {
  const params = useParams();
  const slug = String(params.slug ?? "");
  const { addItem } = useShopCart();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/shop/products/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Not found");
        setProduct(data.product);
        setSettings(data.settings);
        const first = data.product as ShopProduct;
        setSize(first.sizes[0] || first.variants[0]?.size || "");
        setColor(first.colors[0]?.name || first.variants[0]?.color || "");
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const variant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((v) => v.size === size && v.color === color) ?? null;
  }, [product, size, color]);

  const price = product && variant ? variantUnitPrice(product, variant) : 0;
  const available = variant ? variantAvailable(variant, qty) : false;
  const remaining = variant ? variantRemaining(variant) : null;

  if (error) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Link href="/shop" className="mt-4 inline-block text-sm text-primary underline">
          Back to shop
        </Link>
      </div>
    );
  }

  if (!product) {
    return <div className="container mx-auto px-4 py-16 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
            {product.images[activeImage] ? (
              <Image
                src={product.images[activeImage]!}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width:768px) 100vw, 50vw"
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
          </div>
          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                    i === activeImage ? "ring-2 ring-[#1a3556] dark:ring-[#ffd700]" : ""
                  }`}
                >
                  <Image src={src} alt="" fill className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
              {product.category}
            </p>
            <h1 className="mt-1 text-3xl font-bold text-foreground">{product.name}</h1>
            <p className="mt-2 text-2xl font-semibold text-[#1a3556] dark:text-[#ffd700]">
              ${price.toFixed(2)}
            </p>
          </div>

          {product.description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          {settings?.fulfillmentInstructions ? (
            <div className="rounded-xl border bg-card p-4 text-sm text-foreground">
              <p className="font-semibold text-[#8a6d00] dark:text-[#ffd700]">How you get it</p>
              <p className="mt-1 text-muted-foreground">{settings.fulfillmentInstructions}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Size</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((s) => {
                const ok = product.variants.some(
                  (v) => v.size === s && v.color === color && variantAvailable(v, 1)
                );
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!ok && color !== ""}
                    onClick={() => setSize(s)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      size === s
                        ? "border-[#1a3556] bg-[#1a3556] text-white dark:border-[#ffd700] dark:bg-[#ffd700] dark:text-[#122540]"
                        : "bg-card text-foreground disabled:opacity-40"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Color</p>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => {
                const ok = product.variants.some(
                  (v) => v.color === c.name && v.size === size && variantAvailable(v, 1)
                );
                return (
                  <button
                    key={c.name}
                    type="button"
                    disabled={!ok && size !== ""}
                    onClick={() => setColor(c.name)}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                      color === c.name
                        ? "border-[#1a3556] dark:border-[#ffd700]"
                        : "bg-card disabled:opacity-40"
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium" htmlFor="qty">
              Qty
            </label>
            <input
              id="qty"
              type="number"
              min={1}
              max={remaining ?? undefined}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-20 rounded-md border bg-background px-2"
            />
            {remaining != null ? (
              <span className="text-xs text-muted-foreground">{remaining} left</span>
            ) : null}
          </div>

          <Button
            className="w-full bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={!variant || !available}
            onClick={() => {
              if (!variant || !product) return;
              addItem({
                productId: product.id,
                variantId: variant.id,
                name: product.name,
                size: variant.size,
                color: variant.color,
                image: product.images[0] ?? null,
                unitPrice: price,
                qty,
              });
              setAdded(true);
            }}
          >
            {available ? "Add to bag" : "Unavailable"}
          </Button>

          {added ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/shop/cart" className="font-medium text-primary underline">
                View bag
              </Link>
              <Link href="/shop" className="text-muted-foreground underline">
                Keep shopping
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
