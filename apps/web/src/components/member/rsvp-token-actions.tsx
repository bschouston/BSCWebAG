"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPackagePrice } from "@/lib/token-packages";
import {
  TokenPackageCards,
  type TokenPackageCardItem,
} from "@/components/member/token-package-cards";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import Link from "next/link";

type WalletPreflight = {
  balance: number;
  tokenAutoReplenishPackageId: string | null;
  cardValid: boolean;
};

type PricingPreflight = {
  unitPriceCents: number;
  currency: string;
};

type PinDialogState = {
  title: string;
  description: string;
  confirmLabel: string;
  nextPackageId: string | null;
};

type RsvpTokenActionsProps = {
  eventId: string;
  tokensNeeded: number;
  rsvpDisabled: boolean;
  rsvpLoading: boolean;
  onRsvp: (
    purchase?:
      | { mode: "unit"; tokenCount: number }
      | { mode: "package"; packageId: string }
  ) => Promise<boolean>;
  getAuthToken: () => Promise<string | undefined>;
  submitLabel?: string;
  ignoreAutoReplenish?: boolean;
};

export function RsvpTokenActions({
  eventId,
  tokensNeeded,
  rsvpDisabled,
  rsvpLoading,
  onRsvp,
  getAuthToken,
  submitLabel = "RSVP Now / Claim Spot",
  ignoreAutoReplenish = false,
}: RsvpTokenActionsProps) {
  const [wallet, setWallet] = useState<WalletPreflight | null>(null);
  const [pricing, setPricing] = useState<PricingPreflight | null>(null);
  const [packages, setPackages] = useState<TokenPackageCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [forcePurchasePanel, setForcePurchasePanel] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  const [pinDialog, setPinDialog] = useState<PinDialogState | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSentHint, setPinSentHint] = useState<string | null>(null);

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
        setPackages(Array.isArray(data.packages) ? data.packages : []);
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

  const requestPin = async () => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not signed in");
    const res = await fetch("/api/member/wallet/pin/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purpose: "prefs" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to send PIN");
    return data as { message?: string };
  };

  const closePinDialog = () => {
    if (pinBusy) return;
    setPinDialog(null);
    setPinValue("");
    setPinError(null);
    setPinSentHint(null);
  };

  const openAutoReplenishPin = async (nextPackageId: string | null) => {
    setPrefsMsg(null);
    setPinError(null);
    setPinValue("");
    setPinSentHint(null);
    setPrefsBusy(true);
    try {
      const sent = await requestPin();
      setPinSentHint(sent.message || "PIN sent to your email");
      setPinDialog({
        title: nextPackageId ? "Confirm auto replenish package" : "Clear auto replenish",
        description: nextPackageId
          ? "We emailed a 6-digit PIN. Enter it to set this package for auto replenish. Your card will not be charged now — only when you RSVP and need more tokens."
          : "We emailed a 6-digit PIN. Enter it to turn off auto replenish.",
        confirmLabel: nextPackageId ? "Set auto replenish" : "Clear auto replenish",
        nextPackageId,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to send PIN");
    } finally {
      setPrefsBusy(false);
    }
  };

  const confirmPin = async () => {
    if (!pinDialog) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/member/wallet/prefs", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenAutoReplenishPackageId: pinDialog.nextPackageId,
          pin: pinValue.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save preference");
      setPrefsMsg(
        pinDialog.nextPackageId
          ? "Auto replenish package saved. You will be charged when you RSVP and need tokens."
          : "Auto replenish cleared."
      );
      setPinDialog(null);
      setPinValue("");
      setPinSentHint(null);
      setForcePurchasePanel(false);
      await load();
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "PIN confirmation failed");
    } finally {
      setPinBusy(false);
    }
  };

  const resendPin = async () => {
    if (!pinDialog) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const sent = await requestPin();
      setPinSentHint(sent.message || "PIN resent to your email");
      setPinValue("");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Failed to resend PIN");
    } finally {
      setPinBusy(false);
    }
  };

  if (loading || !wallet) {
    return (
      <div className="flex w-full items-center justify-center gap-2 py-4 text-muted-foreground md:ml-auto md:w-64">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking balance…
      </div>
    );
  }

  const shortfall = Math.max(0, tokensNeeded - wallet.balance);
  const hasAutoReplenish =
    !ignoreAutoReplenish && Boolean(wallet.tokenAutoReplenishPackageId) && !forcePurchasePanel;
  const hasEnough = shortfall === 0;
  const activeReplenishPackage = packages.find(
    (p) => p.id === wallet.tokenAutoReplenishPackageId
  );

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
        {loadError ? <p className="mb-2 text-xs text-destructive">{loadError}</p> : null}
        {prefsMsg ? (
          <p className="mb-2 text-xs text-[#1a3556] dark:text-[#ffd700]">{prefsMsg}</p>
        ) : null}
        <Button
          className="h-14 w-full bg-[#1a3556] text-lg font-semibold text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          size="lg"
          onClick={() => void runRsvp()}
          disabled={rsvpDisabled || rsvpLoading || purchaseLoading !== null}
        >
          {rsvpLoading || purchaseLoading ? "Booking…" : submitLabel}
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
    <div className="w-full space-y-4 rounded-xl border bg-card p-4 md:p-5">
      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
      {prefsMsg ? (
        <p className="text-xs text-[#1a3556] dark:text-[#ffd700]">{prefsMsg}</p>
      ) : null}

      <div>
        <p className="text-sm font-medium text-foreground">
          You need {shortfall} more token{shortfall === 1 ? "" : "s"} to RSVP
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Current balance: {wallet.balance} · Hold required: {tokensNeeded}
        </p>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Info className="h-4 w-4 shrink-0 text-[#8a6d00] dark:text-[#ffd700]" />
          How auto replenish works here
        </p>
        <p>
          <strong className="font-medium text-foreground">Buy one-time</strong> charges your card
          now for that package and completes this RSVP.
        </p>
        <p>
          <strong className="font-medium text-foreground">Use for auto replenish</strong> saves the
          package, then you confirm RSVP. Because you are short on tokens, your card is
          charged on this page for that package as many times as needed, then your spot is held.
        </p>
        <p>
          The preference also applies to future RSVPs. You can change or turn it off anytime in
          Wallet or here.
        </p>
      </div>

      {activeReplenishPackage ? (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[#FFD700] bg-[color:color-mix(in_srgb,#FFD700_12%,transparent)] px-3 py-2.5 dark:bg-[color:color-mix(in_srgb,#ffd700_18%,transparent)]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6d00] dark:text-[#ffd700]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1a3556] dark:text-white">
              Auto replenish is on
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeReplenishPackage.label ? `${activeReplenishPackage.label} — ` : ""}
              {activeReplenishPackage.tokenAmount} tokens (
              {formatPackagePrice(
                activeReplenishPackage.priceCents,
                activeReplenishPackage.currency
              )}
              ). Confirm RSVP to charge if you still need tokens.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Auto replenish is off. Choose a package below to buy one-time or turn on auto replenish
          for this RSVP.
        </p>
      )}

      <TokenPackageCards
        packages={packages}
        selectedAutoReplenishId={wallet.tokenAutoReplenishPackageId}
        size="compact"
        copyContext="rsvp"
        buyBusy={Boolean(purchaseLoading) || rsvpLoading}
        prefsBusy={prefsBusy || pinBusy}
        buyDisabled={rsvpDisabled}
        prefsDisabled={rsvpDisabled}
        buyLoadingId={purchaseLoading}
        oneTimeInsufficient={(pkg) => wallet.balance + pkg.tokenAmount < tokensNeeded}
        onBuyOneTime={(id) =>
          void runPurchase(id, { mode: "package", packageId: id })
        }
        onToggleAutoReplenish={(id) => void openAutoReplenishPin(id)}
      />

      {unitPriceCents > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or buy exact amount
          </p>
          <Button
            variant="outline"
            className="h-auto min-h-11 w-full whitespace-normal border-2 border-[#1a3556] py-2 text-left text-[#1a3556] hover:bg-[#1a3556]/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#ffd700] dark:bg-transparent dark:text-[#ffd700] dark:hover:bg-[#ffd700]/10"
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
        </div>
      ) : null}

      <Button variant="link" className="h-auto px-0 text-sm" asChild>
        <Link href="/member/wallet">Manage wallet & auto replenish</Link>
      </Button>

      <Dialog open={Boolean(pinDialog)} onOpenChange={(open) => !open && closePinDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pinDialog?.title}</DialogTitle>
            <DialogDescription>{pinDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pinSentHint ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{pinSentHint}</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="rsvpWalletPin">6-digit PIN</Label>
              <Input
                id="rsvpWalletPin"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pinValue.length === 6) void confirmPin();
                }}
              />
            </div>
            {pinError ? <p className="text-sm text-destructive">{pinError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={pinBusy} onClick={() => void resendPin()}>
              Resend PIN
            </Button>
            <Button
              type="button"
              disabled={pinBusy || pinValue.length !== 6}
              onClick={() => void confirmPin()}
            >
              {pinBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {pinDialog?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
