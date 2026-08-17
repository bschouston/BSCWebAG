"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { formatTierPrice } from "@/lib/token-tiers";
import { Plus, ArrowUpRight, ArrowDownLeft, Loader2, CreditCard, Send } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type TierRow = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  label?: string | null;
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

export default function WalletPageClient() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [cardValid, setCardValid] = useState(false);
  const [cardExpired, setCardExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tokenMinThreshold, setTokenMinThreshold] = useState("0");
  const [tokenReplenishAmount, setTokenReplenishAmount] = useState("");
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [transferIts, setTransferIts] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

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
      const [tokRes, tierRes, walletRes] = await Promise.all([
        fetch("/api/member/tokens?limit=50", { headers }),
        fetch("/api/member/token-tiers"),
        fetch("/api/member/wallet", { headers }),
      ]);
      if (!tokRes.ok) {
        const body = await tokRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load wallet");
      }
      const tokData = await tokRes.json();
      setBalance(typeof tokData.balance === "number" ? tokData.balance : 0);
      setTransactions(tokData.transactions ?? []);

      if (tierRes.ok) {
        const tierData = await tierRes.json();
        setTiers(tierData.tiers ?? []);
      }
      if (walletRes.ok) {
        const w = await walletRes.json();
        setCard(w.card ?? null);
        setCardValid(Boolean(w.cardValid));
        setCardExpired(Boolean(w.cardExpired));
        setTokenMinThreshold(String(w.tokenMinThreshold ?? 0));
        setTokenReplenishAmount(
          w.tokenReplenishAmount != null ? String(w.tokenReplenishAmount) : ""
        );
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

  const buyTier = async (tierId: string) => {
    if (!user) return;
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
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Failed to start purchase");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start purchase");
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    await openPinFlow({
      purpose: "prefs",
      title: "Confirm auto top-up settings",
      description: "We emailed a 6-digit PIN. Enter it to save your preferences.",
      confirmLabel: "Save preferences",
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
              tokenMinThreshold: Number(tokenMinThreshold),
              tokenReplenishAmount: Number(tokenReplenishAmount),
              pin,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to save preferences");
          setMsg("Auto top-up preferences saved.");
          await load();
        } finally {
          setPrefsSaving(false);
        }
      },
    });
  };

  const startTransfer = async () => {
    const amount = Number(transferAmount);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Transfer amount must be a whole number of at least 1.");
      return;
    }
    if (!/^\d{8}$/.test(transferIts.replace(/\D/g, ""))) {
      setError("Recipient ITS# must be exactly 8 digits.");
      return;
    }

    setTransferBusy(true);
    try {
      await openPinFlow({
        purpose: "transfer",
        title: "Confirm token transfer",
        description: `We emailed a 6-digit PIN. Enter it to send ${amount} token${amount === 1 ? "" : "s"} to ITS# ${transferIts.replace(/\D/g, "")}.`,
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
              toItsNumber: transferIts,
              amount,
              pin,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Transfer failed");
          setMsg(`Transferred ${amount} token${amount === 1 ? "" : "s"} successfully.`);
          setTransferAmount("");
          setTransferIts("");
          if (typeof data.balance === "number") setBalance(data.balance);
          await refreshProfile();
          await load();
        },
      });
    } finally {
      setTransferBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading wallet…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">My Wallet</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{balance}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Available for weekly event sign-up
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payment card</CardTitle>
            <CardDescription>
              Required for weekly RSVPs and token purchases. Changing your card requires an email
              PIN. The same card may be saved on multiple member accounts.
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
              className="w-full"
              variant={card?.paymentMethodId ? "outline" : "default"}
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Transfer tokens</CardTitle>
          <CardDescription>
            Send whole tokens to another member by ITS#. Max 500 per transfer, 2,000 per day. Requires
            an email PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="transferIts">Recipient ITS#</Label>
            <Input
              id="transferIts"
              inputMode="numeric"
              maxLength={8}
              placeholder="8 digits"
              value={transferIts}
              onChange={(e) => setTransferIts(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transferAmount">Amount</Label>
            <Input
              id="transferAmount"
              type="number"
              min={1}
              max={500}
              step={1}
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={
                transferBusy || busy || pinBusy || !transferIts || !transferAmount
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Auto top-up</CardTitle>
          <CardDescription>
            When your balance falls below the minimum (or you need more for an RSVP), we charge your
            card in steps of the replenish amount until you have enough. Replenish must match an
            active pricing tier. Saving requires an email PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="minThreshold">Minimum threshold</Label>
            <Input
              id="minThreshold"
              type="number"
              min={0}
              step={1}
              value={tokenMinThreshold}
              onChange={(e) => setTokenMinThreshold(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Replenish amount</Label>
            <Select
              value={tokenReplenishAmount || undefined}
              onValueChange={setTokenReplenishAmount}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a tier size" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={String(tier.tokenAmount)}>
                    {tier.tokenAmount} tokens
                    {tier.label ? ` (${tier.label})` : ""} —{" "}
                    {formatTierPrice(tier.priceCents, tier.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={prefsSaving || busy || pinBusy || !tokenReplenishAmount}
              onClick={() => void savePrefs()}
            >
              {prefsSaving || busy ? "Sending PIN…" : "Save preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Buy tokens</CardTitle>
          <CardDescription>Pricing set by Super Admin. Requires a valid card on file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active pricing tiers yet.</p>
          ) : (
            tiers.map((tier) => (
              <div
                key={tier.id}
                className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">
                  {tier.label ? `${tier.label} · ` : ""}
                  {tier.tokenAmount} tokens — {formatTierPrice(tier.priceCents, tier.currency)}
                </span>
                <Button
                  size="sm"
                  disabled={busy || !cardValid}
                  onClick={() => void buyTier(tier.id)}
                >
                  Buy
                </Button>
              </div>
            ))
          )}
          {!cardValid ? (
            <p className="text-xs text-muted-foreground">Add a valid card to enable purchases.</p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Ledger activity for your account.</CardDescription>
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
        </TabsContent>
      </Tabs>

      <Button variant="link" className="px-0" asChild>
        <Link href="/member/events">Back to events</Link>
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
    </div>
  );
}
