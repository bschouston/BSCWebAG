"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function RepayInner() {
  const params = useSearchParams();
  const orderId = params.get("orderId")?.trim() || "";
  const token = params.get("token")?.trim() || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRepay = async () => {
    if (!orderId || !token) {
      setError("This payment link is incomplete.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(orderId)}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start payment");
      if (!data.url) throw new Error("Missing checkout URL");
      window.location.href = data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  };

  if (!orderId || !token) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Invalid link</h1>
        <p className="text-muted-foreground">
          This pay-again link is missing information. Use the button in your email, or contact the
          club.
        </p>
        <Link href="/shop" className="inline-block text-primary underline">
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold text-foreground">Complete payment</h1>
      <p className="text-muted-foreground">
        Your order was approved, but the original card charge did not go through. Pay now with an
        updated card to keep the same order.
      </p>
      <p className="text-xs font-mono text-muted-foreground">Order {orderId}</p>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
        disabled={busy}
        onClick={() => void startRepay()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting…
          </>
        ) : (
          "Pay now"
        )}
      </Button>
      <div>
        <Link href="/shop" className="text-sm text-primary underline">
          Back to shop
        </Link>
      </div>
    </div>
  );
}

export default function ShopRepayPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-muted-foreground">Loading…</div>}>
      <RepayInner />
    </Suspense>
  );
}
