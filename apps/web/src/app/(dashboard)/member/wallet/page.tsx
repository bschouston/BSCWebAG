"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import WalletPageClient from "./wallet-client";

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading wallet…
        </div>
      }
    >
      <WalletPageClient />
    </Suspense>
  );
}
