"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ShopProduct, ShopSettings } from "@/lib/shop/types";
import { SHOP_CATEGORIES, variantRemaining, variantUnitPrice } from "@/lib/shop/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [size, setSize] = useState("all");
  const [color, setColor] = useState("all");
  const [sort, setSort] = useState("featured");
  const [inStock, setInStock] = useState(true);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (size !== "all") params.set("size", size);
    if (color !== "all") params.set("color", color);
    params.set("sort", sort);
    if (inStock) params.set("inStock", "1");
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    setLoading(true);
    fetch(`/api/shop/products?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products ?? []);
        setOpen(Boolean(data.open));
        setSettings(data.settings ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [category, size, color, sort, inStock, minPrice, maxPrice]);

  const sizeOptions = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.sizes.forEach((x) => s.add(x)));
    return [...s].sort();
  }, [products]);

  const colorOptions = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => p.colors.forEach((c) => s.add(c.name)));
    return [...s].sort();
  }, [products]);

  if (!loading && !open) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-foreground">Shop closed</h1>
        <p className="mt-3 text-muted-foreground">
          {settings?.seasonTitle
            ? `${settings.seasonTitle} is not accepting orders right now.`
            : "Merchandise ordering is not open right now."}
        </p>
        {(settings?.orderOpensAt || settings?.orderClosesAt) && (
          <p className="mt-2 text-sm text-muted-foreground">
            {settings.orderOpensAt
              ? `Opens ${new Date(settings.orderOpensAt).toLocaleString()}`
              : null}
            {settings.orderOpensAt && settings.orderClosesAt ? " · " : null}
            {settings.orderClosesAt
              ? `Closes ${new Date(settings.orderClosesAt).toLocaleString()}`
              : null}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#1a3556] dark:text-white md:text-4xl">
          {settings?.seasonTitle || "Shop"}
        </h1>
        {settings?.fulfillmentInstructions ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            No shipping. {settings.fulfillmentInstructions}
          </p>
        ) : null}
        {settings?.orderClosesAt ? (
          <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
            Order window closes {new Date(settings.orderClosesAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4 rounded-2xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
            Filters
          </p>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {SHOP_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Size</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {sizeOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {colorOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Min $</Label>
              <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>Max $</Label>
              <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inStock}
              onChange={(e) => setInStock(e.target.checked)}
              className="rounded border"
            />
            Available only
          </label>
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="priceAsc">Price: low → high</SelectItem>
                <SelectItem value="priceDesc">Price: high → low</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </aside>

        <div>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
              No products match these filters.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
              {products.map((p) => {
                const prices = p.variants.map((v) => variantUnitPrice(p, v));
                const low = Math.min(...prices, p.basePrice);
                const high = Math.max(...prices, p.basePrice);
                const lowStock = p.variants.some((v) => {
                  const r = variantRemaining(v);
                  return r != null && r > 0 && r <= 3;
                });
                return (
                  <Link
                    key={p.id}
                    href={`/shop/${p.slug}`}
                    className="group overflow-hidden rounded-2xl border bg-card transition hover:shadow-md"
                  >
                    <div className="relative aspect-[4/5] bg-muted">
                      {p.images[0] ? (
                        <>
                          <Image
                            src={p.images[0]}
                            alt={p.name}
                            fill
                            className="object-cover transition duration-300 group-hover:opacity-0"
                            sizes="(max-width:768px) 50vw, 25vw"
                            unoptimized
                          />
                          {p.images[1] ? (
                            <Image
                              src={p.images[1]}
                              alt=""
                              fill
                              className="object-cover opacity-0 transition duration-300 group-hover:opacity-100"
                              sizes="(max-width:768px) 50vw, 25vw"
                              unoptimized
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      <p className="text-sm text-[#1a3556] dark:text-[#ffd700]">
                        {low === high ? `$${low.toFixed(2)}` : `From $${low.toFixed(2)}`}
                      </p>
                      {lowStock ? (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Limited remaining
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
