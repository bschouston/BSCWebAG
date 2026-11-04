"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useShopCart } from "@/lib/shop-cart-context";

function SuccessInner() {
  const { clear } = useShopCart();
  const params = useSearchParams();
  const isRepay = params.get("repay") === "1";

  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <div className="container mx-auto max-w-lg px-4 py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold text-foreground">
        {isRepay ? "Payment received" : "Order received"}
      </h1>
      <p className="text-muted-foreground">
        {isRepay
          ? "Thanks — your card was charged and your merch order is confirmed. Check your email for details."
          : "Your card was authorized (not charged yet). We’ll email you when the order is confirmed, or if anything changes."}
      </p>
      <Link href="/shop" className="inline-block text-primary underline">
        Back to shop
      </Link>
    </div>
  );
}

export default function ShopCheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-muted-foreground">Loading…</div>}>
      <SuccessInner />
    </Suspense>
  );
}
