"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useShopCart } from "@/lib/shop-cart-context";
import type { ShopSettings } from "@/lib/shop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ShopCartPage() {
  const { items, setQty, removeItem, totalAmount, clear } = useShopCart();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shop/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? null))
      .catch(() => {});
  }, []);

  const checkout = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          buyerPhone,
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            qty: i.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Your bag is empty</h1>
        <Link href="/shop" className="mt-4 inline-block text-primary underline">
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-8">
      <h1 className="text-3xl font-bold">Bag</h1>

      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId}`}
            className="flex gap-4 rounded-2xl border bg-card p-4"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.image ? (
                <Image src={item.image} alt="" fill className="object-cover" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-muted-foreground">
                {item.size} / {item.color}
              </p>
              <p className="mt-1 text-sm font-medium">${item.unitPrice.toFixed(2)}</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  value={item.qty}
                  onChange={(e) =>
                    setQty(item.productId, item.variantId, Number(e.target.value) || 1)
                  }
                />
                <button
                  type="button"
                  className="text-xs text-destructive underline"
                  onClick={() => removeItem(item.productId, item.variantId)}
                >
                  Remove
                </button>
              </div>
            </div>
            <p className="font-semibold">${(item.unitPrice * item.qty).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          No shipping. Your card will be authorized now and charged only after we confirm the
          order.
        </p>
        {settings?.fulfillmentInstructions ? (
          <p className="text-sm text-foreground">{settings.fulfillmentInstructions}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-1">
          <div className="space-y-1">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-lg font-bold">Total ${totalAmount.toFixed(2)}</p>
          <Button
            className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={submitting || !buyerName || !buyerEmail || !buyerPhone}
            onClick={() => void checkout()}
          >
            {submitting ? "Redirecting…" : "Continue to payment"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="button" className="text-xs text-muted-foreground underline" onClick={clear}>
          Clear bag
        </button>
      </div>
    </div>
  );
}
