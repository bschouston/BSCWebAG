"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import type { ShopColor, ShopProduct, ShopVariant } from "@/lib/shop/types";
import { SHOP_CATEGORIES } from "@/lib/shop/types";
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

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL"];

function buildVariants(
  sizes: string[],
  colors: ShopColor[],
  prev: ShopVariant[]
): ShopVariant[] {
  const map = new Map(prev.map((v) => [v.id, v]));
  const out: ShopVariant[] = [];
  for (const size of sizes) {
    for (const color of colors) {
      const id = `${size}-${color.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const existing = map.get(id);
      out.push(
        existing ?? {
          id,
          size,
          color: color.name,
          sku: id.toUpperCase(),
          orderLimit: null,
          reservedCount: 0,
          price: null,
        }
      );
    }
  }
  return out;
}

export function ShopProductForm({ initial }: { initial?: ShopProduct }) {
  const { user } = useAuth();
  const router = useRouter();
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
    initial?.colors?.length ? initial.colors : [{ name: "Navy", hex: "#1a3556" }]
  );
  const [variants, setVariants] = useState<ShopVariant[]>(initial?.variants ?? []);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizes = useMemo(
    () =>
      sizesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [sizesText]
  );

  const syncVariants = () => {
    setVariants((prev) => buildVariants(sizes, colors, prev));
  };

  const token = async () => (await user?.getIdToken()) || "";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const synced = buildVariants(sizes, colors, variants);
      const body = {
        name,
        slug,
        description,
        category,
        basePrice: Number(basePrice),
        status,
        featured,
        sizes,
        colors,
        variants: synced,
        images,
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

  const uploadImage = async (file: File) => {
    if (!storage || !initial?.id) {
      setError("Save the product once before uploading images, or create then edit.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `shop/${initial.id}/${Date.now()}_${safe}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
      const url = await getDownloadURL(fileRef);
      setImages((prev) => [...prev, url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
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
        <Label>Sizes (comma-separated)</Label>
        <Input value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Colors</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setColors((c) => [...c, { name: "New", hex: "#888888" }])}
          >
            Add color
          </Button>
        </div>
        <div className="space-y-2">
          {colors.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={c.name}
                onChange={(e) => {
                  const next = [...colors];
                  next[i] = { ...c, name: e.target.value };
                  setColors(next);
                }}
                placeholder="Name"
              />
              <Input
                value={c.hex}
                onChange={(e) => {
                  const next = [...colors];
                  next[i] = { ...c, hex: e.target.value };
                  setColors(next);
                }}
                className="w-28"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setColors(colors.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={syncVariants}>
          Generate / refresh variants
        </Button>
      </div>

      {variants.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">Size</th>
                <th className="p-2">Color</th>
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
                  <td className="p-2">{v.color}</td>
                  <td className="p-2">
                    <Input
                      className="h-8"
                      value={v.sku}
                      onChange={(e) => {
                        const next = [...variants];
                        next[i] = { ...v, sku: e.target.value };
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
                      value={v.price ?? ""}
                      onChange={(e) => {
                        const next = [...variants];
                        const raw = e.target.value;
                        next[i] = {
                          ...v,
                          price: raw === "" ? null : Number(raw),
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
          Set sizes and colors, then generate variants.
        </p>
      )}

      <div className="space-y-2">
        <Label>Images</Label>
        {initial?.id ? (
          <Input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadImage(f);
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Create the product first, then edit to upload images.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-20 rounded object-cover border" />
              <button
                type="button"
                className="absolute -right-1 -top-1 rounded bg-destructive px-1 text-[10px] text-white"
                onClick={() => setImages(images.filter((u) => u !== url))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          className="bg-[#1a3556] text-white"
          disabled={saving || !name}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : initial ? "Save product" : "Create product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/shop")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
