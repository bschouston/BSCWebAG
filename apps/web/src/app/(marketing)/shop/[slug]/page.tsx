"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ShopProduct, ShopSettings } from "@/lib/shop/types";
import {
  productHasColors,
  variantAvailable,
  variantRemaining,
  variantUnitPrice,
} from "@/lib/shop/types";
import { useShopCart } from "@/lib/shop-cart-context";
import { ShopImageZoom } from "@/components/shop/shop-image-zoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [customize, setCustomize] = useState(false);
  const [jerseyName, setJerseyName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const mainImageRef = useRef<HTMLDivElement>(null);
  const [thumbStripHeight, setThumbStripHeight] = useState<number | null>(null);

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
        setColor(
          productHasColors(first)
            ? first.colors[0]?.name || first.variants[0]?.color || ""
            : ""
        );
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const hasColors = product ? productHasColors(product) : false;

  const variant = useMemo(() => {
    if (!product) return null;
    if (!hasColors) {
      return product.variants.find((v) => v.size === size) ?? null;
    }
    return product.variants.find((v) => v.size === size && v.color === color) ?? null;
  }, [product, size, color, hasColors]);

  const basePrice = product && variant ? variantUnitPrice(product, variant) : 0;
  const customCfg = product?.customization;
  const customizationFee =
    customize && customCfg?.enabled ? Math.max(0, customCfg.fee) : 0;
  const price = basePrice + customizationFee;
  const available = variant ? variantAvailable(variant, qty) : false;
  const remaining = variant ? variantRemaining(variant) : null;

  useEffect(() => {
    const el = mainImageRef.current;
    if (!el || !product || product.images.length <= 1) {
      setThumbStripHeight(null);
      return;
    }
    const sync = () => setThumbStripHeight(Math.round(el.getBoundingClientRect().height));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [product, activeImage]);

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
        <div className="flex items-start gap-3">
          {product.images.length > 1 ? (
            <div
              className="w-16 shrink-0 overflow-y-auto overscroll-contain [scrollbar-width:thin] sm:w-20"
              style={{
                height: thumbStripHeight ?? undefined,
                maxHeight: thumbStripHeight ?? "70vh",
              }}
            >
              <div className="flex flex-col gap-2">
                {product.images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`relative aspect-square w-full shrink-0 overflow-hidden rounded-md border bg-neutral-950 ${
                      i === activeImage
                        ? "ring-2 ring-[#1a3556] dark:ring-[#ffd700]"
                        : ""
                    }`}
                  >
                    <Image src={src} alt="" fill className="object-contain" unoptimized />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div ref={mainImageRef} className="min-w-0 flex-1">
            {product.images[activeImage] ? (
              <ShopImageZoom
                key={product.images[activeImage]}
                src={product.images[activeImage]!}
                alt={product.name}
                className="aspect-[4/5] rounded-2xl border bg-neutral-950"
                sizes="(max-width:768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border bg-neutral-950 text-muted-foreground">
                No image
              </div>
            )}
          </div>
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
            {customizationFee > 0 ? (
              <p className="text-xs text-muted-foreground">
                Includes ${customizationFee.toFixed(2)} customization
              </p>
            ) : null}
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
                const ok = product.variants.some((v) => {
                  if (v.size !== s || !variantAvailable(v, 1)) return false;
                  if (!hasColors) return true;
                  return v.color === color;
                });
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!ok && (hasColors ? color !== "" : true)}
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

          {hasColors ? (
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
          ) : null}

          {variant?.sku ? (
            <p className="text-sm text-muted-foreground">
              SKU{" "}
              <span className="font-mono font-medium text-foreground">{variant.sku}</span>
            </p>
          ) : null}

          {customCfg?.enabled ? (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={customize}
                  onChange={(e) => {
                    setCustomize(e.target.checked);
                    setFormError(null);
                  }}
                />
                <span>
                  {customCfg.label}
                  <span className="mt-0.5 block font-normal text-muted-foreground">
                    +${customCfg.fee.toFixed(2)} per item
                    {customCfg.helpText ? ` · ${customCfg.helpText}` : ""}
                  </span>
                </span>
              </label>
              {customize ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="jersey-name">
                      Jersey name{customCfg.requireName ? "" : " (optional)"}
                    </Label>
                    <Input
                      id="jersey-name"
                      value={jerseyName}
                      maxLength={customCfg.nameMaxLength}
                      placeholder="e.g. SALIM"
                      onChange={(e) =>
                        setJerseyName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="jersey-number">
                      Number{customCfg.requireNumber ? "" : " (optional)"}
                    </Label>
                    <Input
                      id="jersey-number"
                      inputMode="numeric"
                      value={jerseyNumber}
                      placeholder={`${customCfg.numberMin}–${customCfg.numberMax}`}
                      onChange={(e) =>
                        setJerseyNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

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

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <Button
            className="w-full bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={!variant || !available}
            onClick={() => {
              if (!variant || !product) return;
              setFormError(null);
              let customization = null as null | { jerseyName: string; jerseyNumber: string };
              let fee = 0;
              if (customize && customCfg?.enabled) {
                const name = jerseyName.trim();
                const num = jerseyNumber.trim();
                if (customCfg.requireName && !name) {
                  setFormError("Enter a jersey name");
                  return;
                }
                if (customCfg.requireNumber && !num) {
                  setFormError("Enter a jersey number");
                  return;
                }
                if (num) {
                  const n = Number(num);
                  if (
                    !Number.isFinite(n) ||
                    n < customCfg.numberMin ||
                    n > customCfg.numberMax
                  ) {
                    setFormError(
                      `Number must be between ${customCfg.numberMin} and ${customCfg.numberMax}`
                    );
                    return;
                  }
                }
                if (!name && !num) {
                  setFormError("Enter a name or number to customize");
                  return;
                }
                customization = { jerseyName: name, jerseyNumber: num };
                fee = customCfg.fee;
              }
              addItem({
                productId: product.id,
                variantId: variant.id,
                name: product.name,
                size: variant.size,
                color: variant.color,
                image: product.images[0] ?? null,
                unitPrice: basePrice,
                customizationFee: fee,
                customization,
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
