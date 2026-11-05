"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ShopProduct, ShopSettings } from "@/lib/shop/types";
import { variantRemaining, variantUnitPrice } from "@/lib/shop/types";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type ShopFacets = {
  categories: string[];
  sizes: string[];
  colors: string[];
};

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [facets, setFacets] = useState<ShopFacets>({
    categories: [],
    sizes: [],
    colors: [],
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        const next = data.facets as ShopFacets | undefined;
        const loadedProducts = (data.products ?? []) as ShopProduct[];
        if (next && Array.isArray(next.categories)) {
          setFacets({
            categories: next.categories,
            sizes: Array.isArray(next.sizes) ? next.sizes : [],
            colors: Array.isArray(next.colors) ? next.colors : [],
          });
        } else {
          // Fallback if an older API response has no facets yet
          const categories = new Set<string>();
          const sizes = new Set<string>();
          const colors = new Set<string>();
          for (const p of loadedProducts) {
            if (p.category?.trim()) categories.add(p.category.trim());
            p.sizes.forEach((s) => s?.trim() && sizes.add(s.trim()));
            p.colors.forEach((c) => c.name?.trim() && colors.add(c.name.trim()));
          }
          setFacets({
            categories: [...categories].sort(),
            sizes: [...sizes].sort(),
            colors: [...colors].sort(),
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [category, size, color, sort, inStock, minPrice, maxPrice]);

  const categoryOptions = useMemo(() => {
    const list = [...facets.categories];
    if (category !== "all" && !list.includes(category)) list.unshift(category);
    return list;
  }, [facets.categories, category]);

  const sizeOptions = useMemo(() => {
    const list = [...facets.sizes];
    if (size !== "all" && !list.includes(size)) list.push(size);
    return list;
  }, [facets.sizes, size]);

  const colorOptions = useMemo(() => {
    const list = [...facets.colors];
    if (color !== "all" && !list.includes(color)) list.push(color);
    return list;
  }, [facets.colors, color]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (category !== "all") n += 1;
    if (size !== "all") n += 1;
    if (color !== "all") n += 1;
    if (minPrice.trim()) n += 1;
    if (maxPrice.trim()) n += 1;
    if (!inStock) n += 1; // default is in-stock on; off counts as a choice
    return n;
  }, [category, size, color, minPrice, maxPrice, inStock]);

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

      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside className="rounded-2xl border bg-card p-3 sm:p-4">
          {/* Compact bar on phone/tablet — products stay above the fold */}
          <div className="flex items-center gap-2 lg:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 gap-2"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1a3556] px-1.5 text-[10px] font-bold text-white dark:bg-[#ffd700] dark:text-[#122540]">
                  {activeFilterCount}
                </span>
              ) : null}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")}
              />
            </Button>
            <div className="min-w-0 flex-1 space-y-0">
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-10" aria-label="Sort">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="priceAsc">Price: low → high</SelectItem>
                  <SelectItem value="priceDesc">Price: high → low</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="mb-4 hidden text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700] lg:block">
            Filters
          </p>

          <div
            className={cn(
              "space-y-4",
              filtersOpen ? "mt-4 block" : "hidden",
              "lg:mt-0 lg:block"
            )}
          >
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {sizeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {colorOptions.length > 0 ? (
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {colorOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Min $</Label>
                <Input
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1">
                <Label>Max $</Label>
                <Input
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
                className="rounded border"
              />
              Available only
            </label>
            <div className="hidden space-y-2 lg:block">
              <Label>Sort</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="priceAsc">Price: low → high</SelectItem>
                  <SelectItem value="priceDesc">Price: high → low</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full text-xs text-muted-foreground lg:hidden"
                onClick={() => {
                  setCategory("all");
                  setSize("all");
                  setColor("all");
                  setMinPrice("");
                  setMaxPrice("");
                  setInStock(true);
                }}
              >
                Clear filters
              </Button>
            ) : null}
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
                    <div className="relative aspect-[4/5] overflow-hidden bg-neutral-950">
                      {p.images[0] ? (
                        <Image
                          src={p.images[0]}
                          alt={p.name}
                          fill
                          className="object-contain transition duration-300 ease-out group-hover:scale-125"
                          sizes="(max-width:768px) 50vw, 25vw"
                          unoptimized
                        />
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
