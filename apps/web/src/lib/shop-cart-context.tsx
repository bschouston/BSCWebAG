"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  customizationLineKey,
  lineUnitAmount,
  type ShopLineCustomization,
} from "@/lib/shop/types";

export type ShopCartItem = {
  productId: string;
  variantId: string;
  name: string;
  size: string;
  color: string;
  image?: string | null;
  /** Garment unit price before personalization */
  unitPrice: number;
  customizationFee: number;
  customization: ShopLineCustomization | null;
  qty: number;
};

type ShopCartContextType = {
  items: ShopCartItem[];
  addItem: (item: Omit<ShopCartItem, "qty"> & { qty?: number }) => void;
  removeItem: (productId: string, variantId: string, customizationKey?: string) => void;
  setQty: (
    productId: string,
    variantId: string,
    qty: number,
    customizationKey?: string
  ) => void;
  clear: () => void;
  totalAmount: number;
  totalQty: number;
};

const ShopCartContext = createContext<ShopCartContextType | undefined>(undefined);
const STORAGE_KEY = "bsc_shop_cart_v2";

function lineKey(
  productId: string,
  variantId: string,
  customization?: ShopLineCustomization | null
) {
  return `${productId}:${variantId}:${customizationLineKey(customization)}`;
}

function matchesLine(
  item: ShopCartItem,
  productId: string,
  variantId: string,
  custKey?: string
) {
  const key = custKey ?? "";
  return (
    item.productId === productId &&
    item.variantId === variantId &&
    customizationLineKey(item.customization) === key
  );
}

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("bsc_shop_cart");
      if (raw) {
        const parsed = JSON.parse(raw) as ShopCartItem[];
        setItems(
          parsed.map((i) => ({
            ...i,
            customizationFee:
              typeof i.customizationFee === "number" && Number.isFinite(i.customizationFee)
                ? i.customizationFee
                : 0,
            customization: i.customization ?? null,
          }))
        );
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const addItem = useCallback<ShopCartContextType["addItem"]>((item) => {
    const qty = Math.max(1, item.qty ?? 1);
    const customization = item.customization ?? null;
    const customizationFee =
      customization && typeof item.customizationFee === "number"
        ? Math.max(0, item.customizationFee)
        : 0;
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) =>
          lineKey(i.productId, i.variantId, i.customization) ===
          lineKey(item.productId, item.variantId, customization)
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx]!, qty: next[idx]!.qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          ...item,
          qty,
          customization,
          customizationFee,
        },
      ];
    });
  }, []);

  const removeItem = useCallback(
    (productId: string, variantId: string, customizationKey = "") => {
      setItems((prev) =>
        prev.filter((i) => !matchesLine(i, productId, variantId, customizationKey))
      );
    },
    []
  );

  const setQty = useCallback(
    (productId: string, variantId: string, qty: number, customizationKey = "") => {
      const q = Math.floor(qty);
      setItems((prev) =>
        prev
          .map((i) =>
            matchesLine(i, productId, variantId, customizationKey) ? { ...i, qty: q } : i
          )
          .filter((i) => i.qty > 0)
      );
    },
    []
  );

  const clear = useCallback(() => {
    setItems((prev) => (prev.length === 0 ? prev : []));
  }, []);

  const totalAmount = useMemo(
    () => items.reduce((s, i) => s + lineUnitAmount(i) * i.qty, 0),
    [items]
  );
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  const value = useMemo(
    () => ({ items, addItem, removeItem, setQty, clear, totalAmount, totalQty }),
    [items, addItem, removeItem, setQty, clear, totalAmount, totalQty]
  );

  return <ShopCartContext.Provider value={value}>{children}</ShopCartContext.Provider>;
}

export function useShopCart() {
  const ctx = useContext(ShopCartContext);
  if (!ctx) throw new Error("useShopCart must be used within ShopCartProvider");
  return ctx;
}
