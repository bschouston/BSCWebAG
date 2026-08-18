"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPackagePrice } from "@/lib/token-packages";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type PackageRow = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  label?: string | null;
};

type WalletPreflight = {
  balance: number;
  tokenAutoReplenishPackageId: string | null;
  cardValid: boolean;
};

type PricingPreflight = {
  unitPriceCents: number;
  currency: string;
};

type RsvpTokenActionsProps = {
  eventId: string;
  tokensNeeded: number;
  rsvpDisabled: boolean;
  rsvpLoading: boolean;
  onRsvp: (purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }) => Promise<boolean>;
  getAuthToken: () => Promise<string | undefined>;
};

export function RsvpTokenActions({
  eventId,
  tokensNeeded,
  rsvpDisabled,
  rsvpLoading,
  onRsvp,
  getAuthToken,
}: RsvpTokenActionsProps) {
  const [wallet, setWallet] = useState<WalletPreflight | null>(null);
  const [pricing, setPricing] = useState<PricingPreflight | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [forcePurchasePanel, setForcePurchasePanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getAuthToken();
      const walletHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const [walletRes, pkgRes] = await Promise.all([
        fetch("/api/member/wallet", { headers: walletHeaders }),
        fetch("/api/member/token-packages"),
      ]);
      if (walletRes.ok) {
        const w = await walletRes.json();
        setWallet({
          balance: typeof w.balance === "number" ? w.balance : 0,
          tokenAutoReplenishPackageId:
            typeof w.tokenAutoReplenishPackageId === "string"
              ? w.tokenAutoReplenishPackageId
              : null,
          cardValid: Boolean(w.cardValid),
        });
      } else {
        const body = await walletRes.json().catch(() => ({}));
        setLoadError(body.error || "Could not load wallet");
        setWallet({ balance: 0, tokenAutoReplenishPackageId: null, cardValid: false });
      }
      if (pkgRes.ok) {
        const data = await pkgRes.json();
        setPackages(data.packages ?? []);
        if (data.pricing) {
          setPricing({
            unitPriceCents: Number(data.pricing.unitPriceCents) || 0,
            currency: String(data.pricing.currency || "usd"),
          });
        }
      }
    } catch {
      setLoadError("Could not load wallet");
      setWallet({ balance: 0, tokenAutoReplenishPackageId: null, cardValid: false });
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    void load();
  }, [load, eventId]);

  if (loading || !wallet) {
    return (
      <div className="flex w-full items-center justify-center gap-2 py-4 text-muted-foreground md:ml-auto md:w-64">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking balance…
      </div>
    );
  }

  const shortfall = Math.max(0, tokensNeeded - wallet.balance);
  const hasAutoReplenish = Boolean(wallet.tokenAutoReplenishPackageId) && !forcePurchasePanel;
  const hasEnough = shortfall === 0;

  const runPurchase = async (
    key: string,
    purchase: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ) => {
    setPurchaseLoading(key);
    try {
      const ok = await onRsvp(purchase);
      if (ok) {
        setForcePurchasePanel(false);
        await load();
      }
    } finally {
      setPurchaseLoading(null);
    }
  };

  const runRsvp = async () => {
    const ok = await onRsvp();
    if (!ok) {
      setForcePurchasePanel(true);
      await load();
    }
  };

  if (hasEnough || hasAutoReplenish) {
    return (
      <div className="w-full md:ml-auto md:max-w-md">
        {loadError ? (
          <p className="mb-2 text-xs text-destructive">{loadError}</p>
        ) : null}
        <Button
          className="h-14 w-full bg-[#1a3556] text-lg font-semibold text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          size="lg"
          onClick={() => void runRsvp()}
          disabled={rsvpDisabled || rsvpLoading || purchaseLoading !== null}
        >
          {rsvpLoading || purchaseLoading ? "Booking…" : "RSVP Now / Claim Spot"}
        </Button>
      </div>
    );
  }

  if (!wallet.cardValid) {
    return (
      <div className="w-full space-y-3 md:ml-auto md:max-w-md">
        <p className="text-sm text-muted-foreground">
          You need {shortfall} more token{shortfall === 1 ? "" : "s"} to RSVP. Add a valid card on
          file to purchase tokens.
        </p>
        <Button className="w-full" asChild>
          <Link href="/member/wallet">Go to Wallet</Link>
        </Button>
      </div>
    );
  }

  const unitPriceCents = pricing?.unitPriceCents ?? 0;
  const currency = pricing?.currency ?? "usd";
  const unitTotalCents = shortfall * unitPriceCents;

  return (
    <div className="w-full space-y-4 rounded-xl border bg-card p-4 md:ml-auto md:max-w-md">
      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
      <div>
        <p className="text-sm font-medium text-foreground">
          You need {shortfall} more token{shortfall === 1 ? "" : "s"} to RSVP
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Current balance: {wallet.balance} · Hold required: {tokensNeeded}
        </p>
      </div>

      {unitPriceCents > 0 ? (
        <Button
          className="h-12 w-full bg-[#1a3556] text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
          disabled={rsvpDisabled || rsvpLoading || purchaseLoading !== null}
          onClick={() =>
            void runPurchase("unit", { mode: "unit", tokenCount: shortfall })
          }
        >
          {purchaseLoading === "unit" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Buy {shortfall} token{shortfall === 1 ? "" : "s"} for{" "}
          {formatPackagePrice(unitTotalCents, currency)} to complete RSVP
        </Button>
      ) : null}

      {packages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or purchase a package
          </p>
          {packages.map((pkg) => {
            const label = pkg.label || `${pkg.tokenAmount} tokens`;
            const coversRsvp = wallet.balance + pkg.tokenAmount >= tokensNeeded;
            return (
              <Button
                key={pkg.id}
                variant="outline"
                className="h-auto min-h-11 w-full whitespace-normal py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !coversRsvp ||
                  rsvpDisabled ||
                  rsvpLoading ||
                  purchaseLoading !== null
                }
                title={
                  !coversRsvp
                    ? `${pkg.tokenAmount} tokens is not enough — you need ${shortfall} more`
                    : undefined
                }
                onClick={() =>
                  void runPurchase(pkg.id, { mode: "package", packageId: pkg.id })
                }
              >
                {purchaseLoading === pkg.id ? (
                  <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                ) : null}
                Buy {label} for {formatPackagePrice(pkg.priceCents, pkg.currency)} to complete
                RSVP
              </Button>
            );
          })}
        </div>
      ) : null}

      <Button variant="link" className="h-auto px-0 text-xs" asChild>
        <Link href="/member/wallet">Manage wallet & auto replenish</Link>
      </Button>
    </div>
  );
}
