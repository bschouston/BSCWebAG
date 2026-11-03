"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useShopCart } from "@/lib/shop-cart-context";

function SuccessInner() {
  const { clear } = useShopCart();
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <div className="container mx-auto max-w-lg px-4 py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold text-foreground">Order received</h1>
      <p className="text-muted-foreground">
        Your card was authorized. We’ll confirm the order soon — you won’t be charged until then.
      </p>
      {sessionId ? (
        <p className="text-xs font-mono text-muted-foreground">Ref: {sessionId.slice(0, 20)}…</p>
      ) : null}
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
