"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ShopCartItem = {
  productId: string;
  variantId: string;
  name: string;
  size: string;
  color: string;
  image?: string | null;
  unitPrice: number;
  qty: number;
};

type ShopCartContextType = {
  items: ShopCartItem[];
  addItem: (item: Omit<ShopCartItem, "qty"> & { qty?: number }) => void;
  removeItem: (productId: string, variantId: string) => void;
  setQty: (productId: string, variantId: string, qty: number) => void;
  clear: () => void;
  totalAmount: number;
  totalQty: number;
};

const ShopCartContext = createContext<ShopCartContextType | undefined>(undefined);
const STORAGE_KEY = "bsc_shop_cart";

function lineKey(productId: string, variantId: string) {
  return `${productId}:${variantId}`;
}

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const addItem: ShopCartContextType["addItem"] = (item) => {
    const qty = Math.max(1, item.qty ?? 1);
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.productId === item.productId && i.variantId === item.variantId
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx]!, qty: next[idx]!.qty + qty };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  };

  const removeItem = (productId: string, variantId: string) => {
    setItems((prev) =>
      prev.filter((i) => lineKey(i.productId, i.variantId) !== lineKey(productId, variantId))
    );
  };

  const setQty = (productId: string, variantId: string, qty: number) => {
    const q = Math.floor(qty);
    setItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId && i.variantId === variantId ? { ...i, qty: q } : i
        )
        .filter((i) => i.qty > 0)
    );
  };

  const clear = () => setItems([]);

  const totalAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return (
    <ShopCartContext.Provider
      value={{ items, addItem, removeItem, setQty, clear, totalAmount, totalQty }}
    >
      {children}
    </ShopCartContext.Provider>
  );
}

export function useShopCart() {
  const ctx = useContext(ShopCartContext);
  if (!ctx) throw new Error("useShopCart must be used within ShopCartProvider");
  return ctx;
}
