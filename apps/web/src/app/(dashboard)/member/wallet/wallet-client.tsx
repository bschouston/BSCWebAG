"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { formatPackagePrice, normalizePackageCardColor, packageCardForeground } from "@/lib/token-packages";
import { maxSendableTokens, TRANSFER_DAILY_MAX, TRANSFER_MAX, TRANSFER_MIN } from "@/lib/token-transfer-limits";
import { memberAreaTitle, memberFullName } from "@/lib/member-name";
import { MemberPageHeader } from "@/components/dashboard/member-page-header";
import { MemberSectionJumpNav } from "@/components/dashboard/member-section-jump-nav";
import { Plus, ArrowUpRight, ArrowDownLeft, Loader2, CreditCard, Send, CheckCircle2, Info, Minus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

type TxRow = {
  id: string;
  type?: string;
  amount?: number;
  reason?: string | null;
  description?: string | null;
  createdAt?: string | null;
  balanceAfter?: number | null;
};

type PackageRow = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  label?: string | null;
  cardColor?: string | null;
};

type CardInfo = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  paymentMethodId: string | null;
};

type PinPurpose = "transfer" | "prefs" | "card";

type PinDialogState = {
  purpose: PinPurpose;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (pin: string) => Promise<void>;
};

type PendingTokenRequest = {
  id: string;
  amount: number;
  reason: string;
  status: string;
};

type TransferRecipient = {
  itsNumber: string;
  firstName?: string;
  lastName?: string;
  name: string;
};

export default function WalletPageClient() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [cardValid, setCardValid] = useState(false);
  const [cardExpired, setCardExpired] = useState(false);
  const [billingFrozen, setBillingFrozen] = useState(false);
  const [walletStripeMode, setWalletStripeMode] = useState<"live" | "test">("live");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tokenAutoReplenishPackageId, setTokenAutoReplenishPackageId] = useState<string | null>(
    null
  );
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [transferIts, setTransferIts] = useState("");
  const [transferAmount, setTransferAmount] = useState(TRANSFER_MIN);
  const [transferBusy, setTransferBusy] = useState(false);
  const [tokensTransferredToday, setTokensTransferredToday] = useState(0);
  const [recentRecipients, setRecentRecipients] = useState<TransferRecipient[]>([]);
  const [recipientPreview, setRecipientPreview] = useState<TransferRecipient | null>(null);
  const [recipientLookupError, setRecipientLookupError] = useState<string | null>(null);
  const [recipientLookupLoading, setRecipientLookupLoading] = useState(false);
  const [pendingTokenRequest, setPendingTokenRequest] = useState<PendingTokenRequest | null>(null);
  const [unitPriceCents, setUnitPriceCents] = useState(0);
  const [tokenCurrency, setTokenCurrency] = useState("usd");
  const [requestPayBusy, setRequestPayBusy] = useState<string | null>(null);
  const [legacyClaim, setLegacyClaim] = useState<{ its: string; tokens: number; name: string } | null>(
    null
  );
  const [legacyClaimOpen, setLegacyClaimOpen] = useState(false);
  const [legacyClaimBusy, setLegacyClaimBusy] = useState(false);
  const [legacyClaimError, setLegacyClaimError] = useState<string | null>(null);

  const [pinDialog, setPinDialog] = useState<PinDialogState | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSentHint, setPinSentHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [tokRes, pkgRes, walletRes, legacyRes] = await Promise.all([
        fetch("/api/member/tokens?limit=50", { headers }),
        fetch("/api/member/token-packages"),
        fetch("/api/member/wallet", { headers }),
        fetch("/api/member/legacy-token-claim", { headers }),
      ]);

      if (tokRes.ok) {
        const tokData = await tokRes.json();
        setBalance(typeof tokData.balance === "number" ? tokData.balance : 0);
        setTransactions(tokData.transactions ?? []);
      } else {
        const body = await tokRes.json().catch(() => ({}));
        setError(body.error || "Failed to load transaction history");
        setBalance(profile?.tokenBalance ?? 0);
      }

      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setPackages(pkgData.packages ?? []);
        if (pkgData.pricing) {
          setUnitPriceCents(Number(pkgData.pricing.unitPriceCents) || 0);
          setTokenCurrency(String(pkgData.pricing.currency || "usd"));
        }
      }

      if (walletRes.ok) {
        const w = await walletRes.json();
        setCard(w.card ?? null);
        setCardValid(Boolean(w.cardValid));
        setCardExpired(Boolean(w.cardExpired));
        setBillingFrozen(Boolean(w.billingFrozen));
        setWalletStripeMode(w.walletStripeMode === "test" ? "test" : "live");
        setTokenAutoReplenishPackageId(
          typeof w.tokenAutoReplenishPackageId === "string"
            ? w.tokenAutoReplenishPackageId
            : null
        );
        if (typeof w.balance === "number") setBalance(w.balance);
        setTokensTransferredToday(
          typeof w.tokensTransferredToday === "number" ? w.tokensTransferredToday : 0
        );
        setRecentRecipients(Array.isArray(w.recentRecipients) ? w.recentRecipients : []);
        setPendingTokenRequest(w.pendingTokenRequest ?? null);
      }

      if (legacyRes.ok) {
        const legacyData = await legacyRes.json();
        const claim = legacyData.claim;
        if (
          claim &&
          typeof claim.tokens === "number" &&
          claim.tokens > 0 &&
          typeof claim.its === "string"
        ) {
          setLegacyClaim({
            its: claim.its,
            tokens: claim.tokens,
            name: typeof claim.name === "string" ? claim.name : "",
          });
        } else {
          setLegacyClaim(null);
        }
      } else {
        setLegacyClaim(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallet");
      setBalance(profile?.tokenBalance ?? 0);
    } finally {
      setLoading(false);
    }
  }, [user, profile?.tokenBalance]);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  useEffect(() => {
    const its = transferIts.replace(/\D/g, "");
    if (its.length !== 8) {
      setRecipientPreview(null);
      setRecipientLookupError(null);
      setRecipientLookupLoading(false);
      return;
    }
    if (!user) return;
    let cancelled = false;
    setRecipientLookupLoading(true);
    setRecipientLookupError(null);
    const timer = window.setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/member/wallet/transfer-recipient?its=${encodeURIComponent(its)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setRecipientPreview(null);
          setRecipientLookupError(typeof data.error === "string" ? data.error : "Member not found");
          return;
        }
        setRecipientPreview({
          itsNumber: typeof data.itsNumber === "string" ? data.itsNumber : its,
          name: typeof data.name === "string" ? data.name : "Member",
          firstName: data.firstName,
          lastName: data.lastName,
        });
        setRecipientLookupError(null);
      } catch {
        if (!cancelled) {
          setRecipientPreview(null);
          setRecipientLookupError("Could not look up that ITS#");
        }
      } finally {
        if (!cancelled) setRecipientLookupLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [transferIts, user]);

  useEffect(() => {
    if (!user) return;
    const setup = searchParams.get("setup");
    const purchase = searchParams.get("purchase");
    const sessionId = searchParams.get("session_id");

    (async () => {
      if (setup === "success" && sessionId) {
        setBusy(true);
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/member/wallet/confirm-setup", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to save card");
          setMsg("Card saved successfully.");
          await refreshProfile();
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save card");
        } finally {
          setBusy(false);
          window.history.replaceState({}, "", "/member/wallet");
        }
      } else if (setup === "cancelled") {
        setMsg("Card setup cancelled.");
        window.history.replaceState({}, "", "/member/wallet");
      } else if (purchase === "success") {
        setMsg("Payment received. Tokens will appear in your balance shortly.");
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          await load();
          await refreshProfile();
        }
        window.history.replaceState({}, "", "/member/wallet");
      } else if (purchase === "cancelled") {
        setMsg("Purchase cancelled.");
        window.history.replaceState({}, "", "/member/wallet");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchParams]);

  const requestPin = async (purpose: PinPurpose) => {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const res = await fetch("/api/member/wallet/pin/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purpose }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to send PIN");
    return data as { expiresAt?: string; message?: string };
  };

  const openPinFlow = async (state: Omit<PinDialogState, "onConfirm"> & {
    onConfirm: (pin: string) => Promise<void>;
  }) => {
    if (!user) return;
    setError(null);
    setMsg(null);
    setPinError(null);
    setPinValue("");
    setPinSentHint(null);
    setBusy(true);
    try {
      const sent = await requestPin(state.purpose);
      setPinSentHint(sent.message || "PIN sent to your email");
      setPinDialog(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send PIN");
    } finally {
      setBusy(false);
    }
  };

  const closePinDialog = () => {
    if (pinBusy) return;
    setPinDialog(null);
    setPinValue("");
    setPinError(null);
    setPinSentHint(null);
  };

  const claimLegacyTokens = async () => {
    if (!user || !legacyClaim) return;
    setLegacyClaimBusy(true);
    setLegacyClaimError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/legacy-token-claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Claim failed");
      setLegacyClaimOpen(false);
      setLegacyClaim(null);
      setMsg(
        `Claimed ${legacyClaim.tokens} token${legacyClaim.tokens === 1 ? "" : "s"} from the previous app.`
      );
      await load();
    } catch (e) {
      setLegacyClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setLegacyClaimBusy(false);
    }
  };

  const confirmPin = async () => {
    if (!pinDialog) return;
    setPinBusy(true);
    setPinError(null);
    try {
      await pinDialog.onConfirm(pinValue.trim());
      setPinDialog(null);
      setPinValue("");
      setPinSentHint(null);
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "PIN confirmation failed");
    } finally {
      setPinBusy(false);
    }
  };

  const resendPin = async () => {
    if (!pinDialog || !user) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const sent = await requestPin(pinDialog.purpose);
      setPinSentHint(sent.message || "PIN resent to your email");
      setPinValue("");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Failed to resend PIN");
    } finally {
      setPinBusy(false);
    }
  };

  const startSetup = async () => {
    await openPinFlow({
      purpose: "card",
      title: "Confirm card change",
      description: "We emailed a 6-digit PIN. Enter it to continue to Stripe card setup.",
      confirmLabel: "Continue to Stripe",
      onConfirm: async (pin) => {
        if (!user) throw new Error("Not signed in");
        const token = await user.getIdToken();
        const res = await fetch("/api/member/wallet/setup-session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || "Failed to start card setup");
        window.location.assign(data.url);
      },
    });
  };

  const removeCard = async () => {
    if (!user || !card?.paymentMethodId) return;
    if (
      !confirm(
        "Remove the card on file? You will not be able to RSVP for weekly events or buy tokens until you add a card again. Your token balance is unchanged."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/wallet/card", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove card");
      setMsg("Card removed. Add a card before weekly RSVP or token purchases.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove card");
    } finally {
      setBusy(false);
    }
  };

  const buyPackage = async (packageId: string) => {
    if (!user) return;
    if (pendingTokenRequest) {
      setError("Pay the Super Admin token request using the options on this page — one-time checkout is paused until then.");
      return;
    }
    if (!cardValid) {
      setError("Add a valid card before purchasing tokens.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/member/wallet/purchase", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to start purchase");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start purchase");
      setBusy(false);
    }
  };

  const payTokenRequest = async (
    purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
  ) => {
    if (!user || !pendingTokenRequest) return;
    const key = purchase
      ? purchase.mode === "unit"
        ? "unit"
        : purchase.packageId
      : "pay";
    setRequestPayBusy(key);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/member/token-requests/${pendingTokenRequest.id}/pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(purchase ? { purchase } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "CARD_REQUIRED") {
          setError(data.error || "Add a card to purchase tokens for this request.");
          return;
        }
        throw new Error(data.error || "Could not pay the token request");
      }
      setMsg("Token request paid. Your wallet is unfrozen.");
      setPendingTokenRequest(null);
      if (typeof data.balance === "number") setBalance(data.balance);
      await refreshProfile();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pay the token request");
    } finally {
      setRequestPayBusy(null);
    }
  };

  const setAutoReplenishPackage = async (packageId: string | null) => {
    const isClearing =
      packageId === null ||
      (packageId === tokenAutoReplenishPackageId && tokenAutoReplenishPackageId !== null);
    const nextId = isClearing ? null : packageId;

    await openPinFlow({
      purpose: "prefs",
      title: nextId ? "Confirm auto replenish package" : "Clear auto replenish",
      description: nextId
        ? "We emailed a 6-digit PIN. Enter it to set this package for auto replenish. Your card will not be charged now — only when you RSVP and need more tokens."
        : "We emailed a 6-digit PIN. Enter it to turn off auto replenish.",
      confirmLabel: nextId ? "Set auto replenish" : "Clear auto replenish",
      onConfirm: async (pin) => {
        if (!user) throw new Error("Not signed in");
        setPrefsSaving(true);
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/member/wallet/prefs", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tokenAutoReplenishPackageId: nextId,
              pin,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to save preference");
          setMsg(
            nextId
              ? "Auto replenish package saved. You will be charged when you RSVP and need tokens."
              : "Auto replenish cleared."
          );
          await load();
        } finally {
          setPrefsSaving(false);
        }
      },
    });
  };

  const startTransfer = async () => {
    if (pendingTokenRequest) {
      setError("Pay the Super Admin token request before transferring tokens.");
      return;
    }
    const amount = transferAmount;
    const its = transferIts.replace(/\D/g, "");
    if (!recipientPreview || recipientPreview.itsNumber !== its) {
      setError("Look up a valid member ITS# before sending.");
      return;
    }
    if (!Number.isInteger(amount) || amount < TRANSFER_MIN) {
      setError(`Transfer amount must be at least ${TRANSFER_MIN}.`);
      return;
    }
    const maxSend = maxSendableTokens({ balance, tokensTransferredToday });
    if (amount > maxSend) {
      setError(`You can send up to ${maxSend} token${maxSend === 1 ? "" : "s"} right now.`);
      return;
    }

    setTransferBusy(true);
    try {
      await openPinFlow({
        purpose: "transfer",
        title: "Confirm token transfer",
        description: `We emailed a 6-digit PIN. Enter it to send ${amount} token${amount === 1 ? "" : "s"} to ${recipientPreview.name} (ITS# ${its}).`,
        confirmLabel: "Send tokens",
        onConfirm: async (pin) => {
          if (!user) throw new Error("Not signed in");
          const token = await user.getIdToken();
          const res = await fetch("/api/member/wallet/transfer", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              toItsNumber: its,
              amount,
              pin,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Transfer failed");
          setMsg(
            `Transferred ${amount} token${amount === 1 ? "" : "s"} to ${recipientPreview.name}.`
          );
          setTransferIts("");
          setRecipientPreview(null);
          setRecipientLookupError(null);
          setTransferAmount(TRANSFER_MIN);
          if (typeof data.balance === "number") setBalance(data.balance);
          await refreshProfile();
          await load();
        },
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const activeReplenishPackage = packages.find(
    (p) => p.id === tokenAutoReplenishPackageId
  );
  const maxSend = maxSendableTokens({ balance, tokensTransferredToday });
  const dailyRemaining = Math.max(0, TRANSFER_DAILY_MAX - tokensTransferredToday);

  useEffect(() => {
    setTransferAmount((prev) => {
      if (maxSend <= 0) return TRANSFER_MIN;
      return Math.min(Math.max(TRANSFER_MIN, prev), maxSend);
    });
  }, [maxSend]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading wallet…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MemberPageHeader
        title={memberAreaTitle(
          memberFullName({
            firstName: profile?.firstName,
            lastName: profile?.lastName,
            displayName: user?.displayName,
          }),
          "Wallet"
        )}
        subtitle="Tokens, card, transfers, and token packages — all in one place."
      />
      <MemberSectionJumpNav
        items={[
          { id: "balance", label: "Token Balance" },
          { id: "payment-card", label: "Payment card" },
          { id: "transfer", label: "Transfer tokens" },
          { id: "packages", label: "Token packages" },
          { id: "history", label: "Transaction History" },
        ]}
      />
      {legacyClaim ? (
        <div className="rounded-md border-2 border-red-600 bg-red-50 px-4 py-3.5 text-base font-medium text-red-950 shadow-[0_0_24px_rgba(220,38,38,0.35)] dark:border-red-400 dark:bg-red-950/50 dark:text-red-100 dark:shadow-[0_0_28px_rgba(248,113,113,0.45)]">
          You have{" "}
          <span className="font-bold tabular-nums">{legacyClaim.tokens}</span> token
          {legacyClaim.tokens === 1 ? "" : "s"} from the previous app.{" "}
          <button
            type="button"
            className="font-bold text-red-700 underline decoration-2 underline-offset-4 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
            onClick={() => {
              setLegacyClaimError(null);
              setLegacyClaimOpen(true);
            }}
          >
            Click here to claim
          </button>
          .
        </div>
      ) : null}
      {walletStripeMode === "test" ? (
        <div className="rounded-md border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
          Stripe sandbox is on for this wallet. Use test cards (for example 4242 4242 4242 4242).
          No real money is charged. Featured tournament registrations still use live Stripe.
        </div>
      ) : null}
      {billingFrozen ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Your wallet is frozen due to a payment dispute. Purchases, transfers, auto replenish, and
          weekly RSVPs are blocked until a Super Admin reviews your account. Token balances are not
          changed automatically.
        </div>
      ) : null}
      {pendingTokenRequest ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-destructive">
              Token request — payment required
            </CardTitle>
            <CardDescription>
              Super Admin requested {pendingTokenRequest.amount} token
              {pendingTokenRequest.amount === 1 ? "" : "s"}. RSVPs, transfers, and one-time package
              checkout are frozen until you pay. You can still add a card here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground">
              Reason: <span className="font-medium">{pendingTokenRequest.reason}</span>
            </p>
            {balance >= pendingTokenRequest.amount ? (
              <Button
                className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540] disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                disabled={Boolean(requestPayBusy) || billingFrozen}
                onClick={() => void payTokenRequest()}
              >
                {requestPayBusy === "pay" ? "Paying…" : `Pay ${pendingTokenRequest.amount} tokens`}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  You have {balance} token{balance === 1 ? "" : "s"}. Short{" "}
                  {pendingTokenRequest.amount - balance}. Buy tokens with your card, then the request
                  is paid automatically.
                </p>
                {!cardValid ? (
                  <p className="text-sm text-destructive">Add a valid card above to purchase tokens.</p>
                ) : billingFrozen ? (
                  <p className="text-sm text-destructive">
                    Billing is frozen, so the card cannot be charged. Contact Super Admin.
                  </p>
                ) : (
                  <>
                    {unitPriceCents > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
                          Exact amount
                        </p>
                        <Button
                          className="w-full bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540] disabled:bg-muted disabled:text-foreground disabled:opacity-100 sm:w-auto"
                          disabled={Boolean(requestPayBusy)}
                          onClick={() =>
                            void payTokenRequest({
                              mode: "unit",
                              tokenCount: pendingTokenRequest.amount - balance,
                            })
                          }
                        >
                          {requestPayBusy === "unit"
                            ? "Purchasing…"
                            : `Buy ${pendingTokenRequest.amount - balance} tokens for ${formatPackagePrice(
                                (pendingTokenRequest.amount - balance) * unitPriceCents,
                                tokenCurrency
                              )}`}
                        </Button>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
                        Token packages
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Optional set packages. Any tokens beyond the {pendingTokenRequest.amount - balance}{" "}
                        you owe stay in your wallet after the request is paid.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {packages.filter(
                          (pkg) => pkg.tokenAmount >= pendingTokenRequest.amount - balance
                        ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No packages large enough to cover the shortfall.
                          </p>
                        ) : (
                          packages
                            .filter((pkg) => pkg.tokenAmount >= pendingTokenRequest.amount - balance)
                            .map((pkg) => (
                              <Button
                                key={pkg.id}
                                variant="outline"
                                className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                                disabled={Boolean(requestPayBusy)}
                                onClick={() =>
                                  void payTokenRequest({ mode: "package", packageId: pkg.id })
                                }
                              >
                                {requestPayBusy === pkg.id
                                  ? "Purchasing…"
                                  : `${pkg.label || `${pkg.tokenAmount} tokens`} · ${formatPackagePrice(
                                      pkg.priceCents,
                                      pkg.currency
                                    )}`}
                              </Button>
                            ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="balance" className="mz-balance scroll-mt-28">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-extrabold tabular-nums tracking-tight text-[color:var(--mz-navy)] dark:text-white">
              {balance}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Available for weekly event sign-up
            </p>
          </CardContent>
        </Card>

        <Card id="payment-card" className="scroll-mt-28">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment card</CardTitle>
            <CardDescription>
              Required for weekly RSVPs and token purchases. Card numbers and other details are stored
              with Stripe, not on this site. We only keep a tokenized reference (brand, last 4, and
              expiry) so you can see what is on file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {card?.paymentMethodId && card.last4 ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium capitalize">
                      {card.brand || "Card"} ···· {card.last4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Exp {card.expMonth}/{card.expYear}
                      {cardExpired ? " · Expired" : ""}
                    </p>
                  </div>
                </div>
                <Badge variant={cardValid ? "outline" : "destructive"}>
                  {cardValid ? "Valid" : "Invalid"}
                </Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No card on file.</p>
            )}
            <Button
              className="w-full bg-[#1a3556] text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
              disabled={busy || pinBusy}
              onClick={() => void startSetup()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {card?.paymentMethodId ? "Replace card" : "Add card"}
            </Button>
            {card?.paymentMethodId ? (
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive hover:text-destructive disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                disabled={busy || pinBusy}
                onClick={() => void removeCard()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove card
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card id="transfer" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Transfer tokens</CardTitle>
          <CardDescription>
            Send tokens to another club member by ITS#. We look up their name so you can confirm the
            right person before anything is sent. You must enter a 6-digit PIN emailed to you to
            complete the transfer. Limit {TRANSFER_MAX} tokens per transfer and {TRANSFER_DAILY_MAX}{" "}
            per day
            {dailyRemaining < TRANSFER_DAILY_MAX
              ? ` (${dailyRemaining} remaining today)`
              : ""}
            .
            {maxSend <= 0
              ? balance <= 0
                ? " You have no tokens to send."
                : " You have reached today’s transfer limit."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentRecipients.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Recent recipients
              </p>
              <div className="flex flex-wrap gap-2">
                {recentRecipients.map((r) => {
                  const selected = transferIts === r.itsNumber;
                  return (
                    <Button
                      key={r.itsNumber}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className={
                        selected
                          ? "h-auto rounded-full bg-[#1a3556] px-3 py-1.5 text-white dark:bg-[#ffd700] dark:text-[#122540]"
                          : "h-auto rounded-full px-3 py-1.5"
                      }
                      onClick={() => setTransferIts(r.itsNumber)}
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-1.5 text-xs opacity-80">{r.itsNumber}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Label htmlFor="transferIts">Recipient ITS#</Label>
            <Label htmlFor="transferAmount" className="flex items-baseline gap-2">
              Amount
              <span className="text-xs font-normal text-muted-foreground">
                max {maxSend}
              </span>
            </Label>
            <span className="hidden sm:block" aria-hidden />

            <Input
              id="transferIts"
              inputMode="numeric"
              maxLength={8}
              placeholder="8 digits"
              className="h-10"
              value={transferIts}
              onChange={(e) => setTransferIts(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <div className="flex h-10 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                disabled={maxSend <= 0 || transferAmount <= TRANSFER_MIN}
                onClick={() => setTransferAmount((n) => Math.max(TRANSFER_MIN, n - 1))}
                aria-label="Decrease amount"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="transferAmount"
                inputMode="numeric"
                className="h-10 w-14 text-center tabular-nums"
                value={maxSend <= 0 ? "0" : String(transferAmount)}
                disabled={maxSend <= 0}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  if (!Number.isFinite(n)) return;
                  setTransferAmount(Math.min(maxSend, Math.max(TRANSFER_MIN, n)));
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                disabled={maxSend <= 0 || transferAmount >= maxSend}
                onClick={() => setTransferAmount((n) => Math.min(maxSend, n + 1))}
                aria-label="Increase amount"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="h-10 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={
                transferBusy ||
                busy ||
                pinBusy ||
                billingFrozen ||
                Boolean(pendingTokenRequest) ||
                maxSend <= 0 ||
                !recipientPreview ||
                recipientLookupLoading
              }
              onClick={() => void startTransfer()}
            >
              {transferBusy || busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Transfer
            </Button>

            <div className="sm:col-span-3">
              {recipientLookupLoading ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Looking up member…
                </p>
              ) : recipientPreview ? (
                <p className="text-sm font-medium text-[#1a3556] dark:text-foreground">
                  Sending to {recipientPreview.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    (ITS# {recipientPreview.itsNumber})
                  </span>
                </p>
              ) : recipientLookupError ? (
                <p className="text-sm text-destructive">{recipientLookupError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enter an 8-digit ITS# — we&apos;ll confirm the member&apos;s name before you can
                  send.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="packages" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Token packages</CardTitle>
          <CardDescription>
            Buy tokens now, or choose a package for auto replenish — your card is only charged when
            you RSVP and need more tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Info className="h-4 w-4 shrink-0 text-[#8a6d00] dark:text-[#ffd700]" />
            How auto replenish works
          </p>
          <p>
            <strong className="font-medium text-foreground">No charge when you select it.</strong>{" "}
            Picking auto replenish only saves your preference — nothing is billed on this page.
          </p>
          <p>
            When you RSVP for a weekly event and your balance is too low, we charge your card for
            the package you selected (as many times as needed until you have enough tokens), then
            complete your RSVP.
          </p>
          <p>
            You can change or turn off auto replenish anytime before your next RSVP.{" "}
            <strong className="font-medium text-foreground">Buy one-time</strong> adds tokens
            immediately via checkout.
          </p>
        </div>

        {activeReplenishPackage ? (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[#FFD700] bg-[color:color-mix(in_srgb,#FFD700_12%,transparent)] px-4 py-3 dark:bg-[color:color-mix(in_srgb,#ffd700_18%,transparent)]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#8a6d00] dark:text-[#ffd700]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1a3556] dark:text-white">
                Auto replenish is on
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {activeReplenishPackage.label
                  ? `${activeReplenishPackage.label} — `
                  : ""}
                {activeReplenishPackage.tokenAmount} tokens (
                {formatPackagePrice(
                  activeReplenishPackage.priceCents,
                  activeReplenishPackage.currency
                )}
                ) will be purchased only when you RSVP and need more tokens.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Auto replenish is off. Select a package below if you want tokens added automatically at
            RSVP.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active packages yet.</p>
          ) : (
            packages.map((pkg) => {
              const bg = normalizePackageCardColor(pkg.cardColor);
              const fg = packageCardForeground(bg);
              const light = fg === "#122540";
              const isSelected = tokenAutoReplenishPackageId === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-xl transition-shadow ${
                    isSelected
                      ? "ring-[3px] ring-[#FFD700] ring-offset-2 ring-offset-background shadow-lg shadow-[#FFD700]/25"
                      : "mz-tile"
                  }`}
                  style={{
                    background: light
                      ? `linear-gradient(145deg, ${bg}, #fff3a0)`
                      : `linear-gradient(145deg, #122540 0%, ${bg} 58%, ${bg})`,
                    color: fg,
                    minHeight: 280,
                  }}
                >
                  {isSelected ? (
                    <div
                      className="absolute right-0 top-0 z-20 flex items-center gap-1 rounded-bl-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
                      style={{
                        background: "#FFD700",
                        color: "#122540",
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Auto replenish active
                    </div>
                  ) : null}
                  <div className="relative z-10 p-4 pt-5">
                    {pkg.label ? (
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-85">
                        {pkg.label}
                      </p>
                    ) : null}
                    <p className="mt-3 text-6xl font-extrabold leading-none tracking-tight tabular-nums">
                      {pkg.tokenAmount}
                    </p>
                    <p className="mt-2 text-base font-semibold uppercase tracking-[0.16em] opacity-85">
                      tokens
                    </p>
                    <p className="mt-5 text-3xl font-extrabold tracking-tight">
                      {formatPackagePrice(pkg.priceCents, pkg.currency)}
                    </p>
                    {isSelected ? (
                      <p
                        className="mt-3 text-xs leading-relaxed opacity-90"
                        style={{ color: fg }}
                      >
                        No charge until you RSVP and need more tokens. Change anytime.
                      </p>
                    ) : null}
                  </div>
                  <div className="relative z-10 space-y-2 px-4 pb-4">
                    <Button
                      type="button"
                      className="w-full border-0 bg-[#FFD700] font-bold text-[#122540] hover:bg-white hover:text-[#122540]"
                      disabled={busy || !cardValid || billingFrozen || Boolean(pendingTokenRequest)}
                      onClick={() => void buyPackage(pkg.id)}
                    >
                      {busy ? "Starting…" : "Buy one-time"}
                    </Button>
                    <Button
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className={
                        isSelected
                          ? "w-full border-0 bg-[#1a3556] font-bold text-white hover:bg-[#122540] dark:bg-white dark:text-[#122540] dark:hover:bg-[#ffd700]"
                          : "w-full border-white/40 bg-transparent font-semibold hover:bg-white/10"
                      }
                      style={
                        isSelected
                          ? undefined
                          : { color: fg, borderColor: light ? "#12254040" : "#ffffff40" }
                      }
                      disabled={prefsSaving || busy || pinBusy || billingFrozen || !cardValid}
                      onClick={() =>
                        void setAutoReplenishPackage(isSelected ? null : pkg.id)
                      }
                    >
                      {isSelected ? "Turn off auto replenish" : "Use for auto replenish"}
                    </Button>
                    {!isSelected ? (
                      <p className="text-center text-[11px] leading-snug opacity-75" style={{ color: fg }}>
                        No charge now — billed only if you RSVP short on tokens
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        {!cardValid ? (
          <p className="text-xs text-muted-foreground">
            Add a valid card to enable purchases and auto replenish.
          </p>
        ) : null}
        </CardContent>
      </Card>

      <Card id="history" className="scroll-mt-28">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Balance after</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <div className="flex items-center">
                            {tx.type === "CREDIT" ? (
                              <ArrowDownLeft className="mr-2 h-4 w-4 text-green-500" />
                            ) : (
                              <ArrowUpRight className="mr-2 h-4 w-4 text-red-500" />
                            )}
                            <span
                              className={
                                tx.type === "CREDIT"
                                  ? "font-medium text-green-600"
                                  : "font-medium text-red-600"
                              }
                            >
                              {tx.type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{tx.description || "—"}</div>
                          {tx.reason ? (
                            <div className="text-xs text-muted-foreground">{tx.reason}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-bold">{tx.amount}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {typeof tx.balanceAfter === "number" ? tx.balanceAfter : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
        </CardContent>
      </Card>

      <Button variant="link" className="px-0 text-[color:var(--mz-navy)] dark:text-[color:var(--mz-gold)]" asChild>
        <Link href="/member/events">Back to My Events</Link>
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
              <Label htmlFor="walletPin">6-digit PIN</Label>
              <Input
                id="walletPin"
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

      <Dialog
        open={legacyClaimOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLegacyClaimOpen(false);
            setLegacyClaimError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim legacy tokens?</DialogTitle>
            <DialogDescription>
              {legacyClaim
                ? `Add ${legacyClaim.tokens} token${legacyClaim.tokens === 1 ? "" : "s"} from the previous app to this wallet. This can only be done once.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {legacyClaimError ? <p className="text-sm text-destructive">{legacyClaimError}</p> : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={legacyClaimBusy}
              onClick={() => setLegacyClaimOpen(false)}
            >
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540] disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={legacyClaimBusy || !legacyClaim}
              onClick={() => void claimLegacyTokens()}
            >
              {legacyClaimBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming…
                </>
              ) : (
                "Claim tokens"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
