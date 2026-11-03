"use client";

import Link from "next/link";
import { useShopCart } from "@/lib/shop-cart-context";
import { ShoppingBag } from "lucide-react";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const { totalQty } = useShopCart();

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/shop"
              className="font-semibold text-[#1a3556] dark:text-[#ffd700]"
            >
              Shop
            </Link>
            <Link href="/shop/cart" className="text-muted-foreground hover:text-foreground">
              Bag
            </Link>
          </div>
          <Link
            href="/shop/cart"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border bg-card text-[#1a3556] dark:text-[#ffd700]"
            aria-label="Shop bag"
          >
            <ShoppingBag className="h-5 w-5" />
            {totalQty > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1a3556] px-1 text-[10px] font-bold text-white dark:bg-[#ffd700] dark:text-[#122540]">
                {totalQty}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
