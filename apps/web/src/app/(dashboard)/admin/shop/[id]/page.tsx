"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ShopProductForm } from "@/components/admin/shop-product-form";
import type { ShopProduct } from "@/lib/shop/types";

export default function EditShopProductPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    void (async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/shop/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Not found");
        return;
      }
      setProduct(data.product);
    })();
  }, [user, id]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!product) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Edit product</h1>
      <ShopProductForm initial={product} />
    </div>
  );
}
