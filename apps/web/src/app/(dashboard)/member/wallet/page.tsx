"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { formatTierPrice } from "@/lib/token-tiers";
import { Plus, ArrowUpRight, ArrowDownLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

export default function WalletPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [tokRes, tierRes] = await Promise.all([
          fetch("/api/member/tokens?limit=50", { headers }),
          fetch("/api/member/token-tiers"),
        ]);
        if (!tokRes.ok) {
          const body = await tokRes.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load wallet");
        }
        const tokData = await tokRes.json();
        if (!cancelled) {
          setBalance(typeof tokData.balance === "number" ? tokData.balance : 0);
          setTransactions(tokData.transactions ?? []);
        }
        if (tierRes.ok) {
          const tierData = await tierRes.json();
          if (!cancelled) setTiers(tierData.tiers ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load wallet");
          setBalance(profile?.tokenBalance ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, profile?.tokenBalance]);

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
            <CardTitle className="text-sm font-medium">Top-up options</CardTitle>
            <CardDescription>
              Purchases with a saved card arrive in a later update. Pricing is set by Super Admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active pricing tiers yet.</p>
            ) : (
              tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {tier.label ? `${tier.label} · ` : ""}
                    {tier.tokenAmount} tokens
                  </span>
                  <span className="font-medium">
                    {formatTierPrice(tier.priceCents, tier.currency)}
                  </span>
                </div>
              ))
            )}
            <Button className="mt-2 w-full" disabled title="Stripe purchase coming soon">
              <Plus className="mr-2 h-4 w-4" />
              Buy tokens (soon)
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
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
                          {tx.createdAt
                            ? new Date(tx.createdAt).toLocaleString()
                            : "—"}
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

        <TabsContent value="payment-methods" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved Cards</CardTitle>
              <CardDescription>
                A valid card will be required for weekly RSVPs. Card save via Stripe comes next.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">No card on file yet.</p>
              <Button variant="outline" className="w-full border-dashed" disabled>
                <Plus className="mr-2 h-4 w-4" />
                Add card (soon)
              </Button>
              <Button variant="link" className="px-0" asChild>
                <Link href="/member/events">Back to events</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
