"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import type {
  ShopColor,
  ShopCustomizationConfig,
  ShopProduct,
  ShopVariant,
} from "@/lib/shop/types";
import { DEFAULT_SHOP_CUSTOMIZATION, SHOP_CATEGORIES } from "@/lib/shop/types";
import {
  allocateUniqueSku,
  collectSkusFromVariants,
  normalizeSku,
  SKU_MAX_LEN,
  suggestSku,
} from "@/lib/shop/sku";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function newProductId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL"];

function parseSizes(sizesText: string): string[] {
  return sizesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function activeColors(colors: ShopColor[]): ShopColor[] {
  return colors
    .map((c) => ({ name: c.name.trim(), hex: c.hex.trim() || "#888888" }))
    .filter((c) => c.name.length > 0);
}

function variantId(size: string, colorName: string): string {
  const base = colorName ? `${size}-${colorName}` : size;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Cartesian size×color, or size-only when no colors are configured. */
function buildVariants(
  productName: string,
  sizes: string[],
  colors: ShopColor[],
  prev: ShopVariant[],
  usedOutside: Set<string>,
  manualSkuIds: Set<string>
): ShopVariant[] {
  const namedColors = activeColors(colors);
  const map = new Map(prev.map((v) => [v.id, v]));
  const bySize = new Map<string, ShopVariant>();
  for (const v of prev) {
    if (!bySize.has(v.size)) bySize.set(v.size, v);
  }
  const used = new Set(usedOutside);
  for (const v of prev) {
    if (!manualSkuIds.has(v.id)) continue;
    const sku = normalizeSku(v.sku);
    if (sku) used.add(sku);
  }

  const out: ShopVariant[] = [];
  const colorList = namedColors.length > 0 ? namedColors : [{ name: "", hex: "" }];
  for (const size of sizes) {
    for (const color of colorList) {
      const id = variantId(size, color.name);
      const existing =
        map.get(id) ??
        (namedColors.length === 0 ? bySize.get(size) : undefined);
      const lockSku = existing ? manualSkuIds.has(existing.id) || manualSkuIds.has(id) : false;
      if (existing && lockSku) {
        const sku =
          normalizeSku(existing.sku) ||
          allocateUniqueSku(suggestSku(productName, size, color.name), used);
        used.add(sku);
        out.push({ ...existing, id, size, color: color.name, sku });
      } else {
        const sku = allocateUniqueSku(suggestSku(productName, size, color.name), used);
        used.add(sku);
        out.push({
          ...(existing ?? {
            orderLimit: null,
            reservedCount: 0,
            price: null,
          }),
          id,
          size,
          color: color.name,
          sku,
          orderLimit: existing?.orderLimit ?? null,
          reservedCount: existing?.reservedCount ?? 0,
          price: existing?.price ?? null,
        });
      }
    }
  }
  return out;
}

export function ShopProductForm({ initial }: { initial?: ShopProduct }) {
  const { user } = useAuth();
  const router = useRouter();
  const productIdRef = useRef(initial?.id ?? newProductId());
  /** Existing / manually edited SKUs are not overwritten when name/sizes change. */
  const manualSkuIdsRef = useRef(new Set<string>(initial?.variants?.map((v) => v.id) ?? []));
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Tops");
  const [basePrice, setBasePrice] = useState(String(initial?.basePrice ?? "35"));
  const [status, setStatus] = useState(initial?.status ?? "DRAFT");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [sizesText, setSizesText] = useState(
    (initial?.sizes?.length ? initial.sizes : DEFAULT_SIZES).join(", ")
  );
  const [colors, setColors] = useState<ShopColor[]>(
    initial?.colors?.length ? initial.colors : []
  );
  const [variants, setVariants] = useState<ShopVariant[]>(initial?.variants ?? []);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [customization, setCustomization] = useState<ShopCustomizationConfig>(
    initial?.customization ?? { ...DEFAULT_SHOP_CUSTOMIZATION }
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedOutsideSkus, setUsedOutsideSkus] = useState<Set<string>>(() => new Set());

  const sizes = useMemo(() => parseSizes(sizesText), [sizesText]);
  const colorsKey = useMemo(
    () => activeColors(colors).map((c) => `${c.name}:${c.hex}`).join("|"),
    [colors]
  );

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const t = await user.getIdToken();
        const res = await fetch("/api/admin/shop/products", {
          headers: { Authorization: `Bearer ${t}` },
        });
        const data = await res.json();
        if (!res.ok) return;
        const used = new Set<string>();
        for (const p of (data.products ?? []) as ShopProduct[]) {
          if (initial?.id && p.id === initial.id) continue;
          for (const sku of collectSkusFromVariants(p.variants ?? [])) used.add(sku);
        }
        setUsedOutsideSkus(used);
      } catch {
        /* ignore — server still enforces uniqueness on save */
      }
    })();
  }, [user, initial?.id]);

  // Keep the matrix in sync when sizes/colors/name change (no separate click required).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const named = activeColors(colors);
      const nextSizes = parseSizes(sizesText);
      if (!nextSizes.length) {
        setVariants([]);
        return;
      }
      setVariants((prev) =>
        buildVariants(name, nextSizes, named, prev, usedOutsideSkus, manualSkuIdsRef.current)
      );
    }, 200);
    return () => window.clearTimeout(timer);
    // colorsKey captures named color edits; `colors` read inside for current rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesText, colorsKey, name, usedOutsideSkus]);

  const token = async () => (await user?.getIdToken()) || "";

  const remove = async () => {
    if (!initial?.id) return;
    const ok = window.confirm(
      `Delete “${name || initial.name}”? If it has reserved inventory from orders, it will be archived instead.`
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const t = await token();
      const res = await fetch(`/api/admin/shop/products/${initial.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      router.push("/admin/shop");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const named = activeColors(colors);
      const synced = buildVariants(
        name,
        sizes,
        named,
        variants,
        usedOutsideSkus,
        manualSkuIdsRef.current
      );
      const body = {
        ...(initial ? {} : { id: productIdRef.current }),
        name,
        slug,
        description,
        category,
        basePrice: Number(basePrice),
        status,
        featured,
        sizes,
        colors: named,
        variants: synced,
        images,
        customization,
      };
      const t = await token();
      const res = await fetch(
        initial ? `/api/admin/shop/products/${initial.id}` : "/api/admin/shop/products",
        {
          method: initial ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/admin/shop");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadImages = async (files: File[]) => {
    if (!files.length) return;
    if (!storage) {
      setError("Storage is not configured.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const safe = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `shop/${productIdRef.current}/${Date.now()}_${safe}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
        urls.push(await getDownloadURL(fileRef));
      }
      setImages((prev) => [...prev, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const setPrimaryImage = (url: string) => {
    setImages((prev) => {
      if (prev[0] === url) return prev;
      return [url, ...prev.filter((u) => u !== url)];
    });
  };

  return (
    <div className="space-y-6 rounded-lg border bg-card p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHOP_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Base price (USD)</Label>
          <Input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ShopProduct["status"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm mt-6">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Featured
        </label>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shop-sizes">Sizes (comma-separated)</Label>
        <Input
          id="shop-sizes"
          value={sizesText}
          onChange={(e) => setSizesText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Variants update automatically when sizes or colors change.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Colors (optional)</p>
            <p className="text-xs text-muted-foreground">
              Leave empty for size-only items (e.g. a single jersey style). Add colors for
              tees and other products with color choices.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setColors((c) => [...c, { name: "", hex: "#888888" }])}
          >
            Add color
          </Button>
        </div>
        <div className="space-y-2">
          {colors.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              No colors — variants will be one per size.
            </p>
          ) : (
            colors.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={c.name}
                  onChange={(e) => {
                    const next = [...colors];
                    next[i] = { ...c, name: e.target.value };
                    setColors(next);
                  }}
                  placeholder="Color name"
                />
                <Input
                  value={c.hex}
                  onChange={(e) => {
                    const next = [...colors];
                    next[i] = { ...c, hex: e.target.value };
                    setColors(next);
                  }}
                  className="w-28"
                  placeholder="#hex"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setColors(colors.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {variants.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">Size</th>
                {activeColors(colors).length > 0 ? <th className="p-2">Color</th> : null}
                <th className="p-2">SKU</th>
                <th className="p-2">Order limit</th>
                <th className="p-2">Reserved</th>
                <th className="p-2">Price override</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.id} className="border-b">
                  <td className="p-2">{v.size}</td>
                  {activeColors(colors).length > 0 ? (
                    <td className="p-2">{v.color || "—"}</td>
                  ) : null}
                  <td className="p-2">
                    <Input
                      className="h-8"
                      value={v.sku}
                      maxLength={SKU_MAX_LEN}
                      onChange={(e) => {
                        manualSkuIdsRef.current.add(v.id);
                        const next = [...variants];
                        next[i] = {
                          ...v,
                          sku: normalizeSku(e.target.value),
                        };
                        setVariants(next);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-24"
                      placeholder="∞"
                      value={v.orderLimit ?? ""}
                      onChange={(e) => {
                        const next = [...variants];
                        const raw = e.target.value;
                        next[i] = {
                          ...v,
                          orderLimit: raw === "" ? null : Math.max(0, Number(raw) || 0),
                        };
                        setVariants(next);
                      }}
                    />
                  </td>
                  <td className="p-2 tabular-nums">{v.reservedCount}</td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-24"
                      placeholder="base"
                      inputMode="decimal"
                      value={
                        typeof v.price === "number" && Number.isFinite(v.price)
                          ? String(v.price)
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const next = [...variants];
                        if (raw === "") {
                          next[i] = { ...v, price: null };
                          setVariants(next);
                          return;
                        }
                        // Ignore non-numeric keystrokes (avoids NaN → Firestore errors).
                        if (!/^\d*\.?\d*$/.test(raw)) return;
                        const n = Number(raw);
                        next[i] = {
                          ...v,
                          price: Number.isFinite(n) && n >= 0 ? n : null,
                        };
                        setVariants(next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add at least one size to create variants.
        </p>
      )}

      <div className="space-y-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={customization.enabled}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, enabled: e.target.checked }))
            }
          />
          Offer name & number customization
        </label>
        {customization.enabled ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Extra fee (USD per item)</Label>
              <Input
                inputMode="decimal"
                value={String(customization.fee)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCustomization((c) => ({
                    ...c,
                    fee: Number.isFinite(n) && n >= 0 ? n : 0,
                  }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Checkout label</Label>
              <Input
                value={customization.label}
                onChange={(e) =>
                  setCustomization((c) => ({ ...c, label: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Help text</Label>
              <Input
                value={customization.helpText}
                onChange={(e) =>
                  setCustomization((c) => ({ ...c, helpText: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Name max length</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={customization.nameMaxLength}
                onChange={(e) =>
                  setCustomization((c) => ({
                    ...c,
                    nameMaxLength: Math.max(1, Math.min(24, Number(e.target.value) || 12)),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Number range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20"
                  value={customization.numberMin}
                  onChange={(e) =>
                    setCustomization((c) => ({
                      ...c,
                      numberMin: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="number"
                  className="w-20"
                  value={customization.numberMax}
                  onChange={(e) =>
                    setCustomization((c) => ({
                      ...c,
                      numberMax: Math.max(0, Number(e.target.value) || 99),
                    }))
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={customization.requireName}
                onChange={(e) =>
                  setCustomization((c) => ({ ...c, requireName: e.target.checked }))
                }
              />
              Require jersey name
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={customization.requireNumber}
                onChange={(e) =>
                  setCustomization((c) => ({ ...c, requireNumber: e.target.checked }))
                }
              />
              Require jersey number
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            When enabled, shoppers can add a printed name and number for an extra fee. That
            personalization is stored on each order line.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="shop-images">Images</Label>
        <Input
          id="shop-images"
          type="file"
          accept="image/*"
          multiple
          disabled={uploading || saving}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void uploadImages(files);
          }}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload one or more photos. The primary image is shown on the main shop grid; all
            photos appear on the product page.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {images.map((url, index) => (
            <div
              key={url}
              className={`relative h-28 w-28 overflow-hidden rounded-md border bg-neutral-950 ${
                index === 0 ? "ring-2 ring-[#1a3556] dark:ring-[#ffd700]" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-contain" />
              {index === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-[#1a3556] px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-[#ffd700] dark:text-[#122540]">
                  Primary
                </span>
              ) : (
                <button
                  type="button"
                  className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black"
                  onClick={() => setPrimaryImage(url)}
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-destructive px-1.5 text-[10px] leading-none text-white"
                onClick={() => setImages(images.filter((u) => u !== url))}
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-[#1a3556] text-white"
          disabled={saving || deleting || !name}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : initial ? "Save product" : "Create product"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving || deleting}
          onClick={() => router.push("/admin/shop")}
        >
          Cancel
        </Button>
        {initial?.id ? (
          <Button
            type="button"
            variant="destructive"
            disabled={saving || deleting}
            onClick={() => void remove()}
          >
            {deleting ? "Deleting…" : "Delete product"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
