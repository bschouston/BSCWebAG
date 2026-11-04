"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import type { ShopOrder } from "@/lib/shop/types";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  ExternalLink,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

type StatusFilter =
  | "all"
  | "authorized"
  | "paid"
  | "released"
  | "refunded"
  | "capture_failed"
  | "pending_repay";

type ModeFilter = "all" | "live" | "sandbox";

function fmtAmount(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function itemsSummary(order: ShopOrder): string {
  return order.lines
    .map((l) => {
      const opts = l.color?.trim() ? `${l.size}/${l.color}` : l.size;
      const custom = [l.customization?.jerseyName, l.customization?.jerseyNumber ? `#${l.customization.jerseyNumber}` : ""]
        .filter(Boolean)
        .join(" ");
      return `${l.qty}× ${l.name} (${opts})${custom ? ` · ${custom}` : ""}`;
    })
    .join("; ");
}

export default function ShopTransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/super-admin/shop-transactions", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setTransactions(data.transactions ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.paymentStatus !== statusFilter) return false;
      if (modeFilter === "live" && !t.stripeLivemode) return false;
      if (modeFilter === "sandbox" && t.stripeLivemode) return false;
      if (!q) return true;
      return (
        t.buyerName.toLowerCase().includes(q) ||
        t.buyerEmail.toLowerCase().includes(q) ||
        t.buyerPhone.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        itemsSummary(t).toLowerCase().includes(q)
      );
    });
  }, [transactions, statusFilter, modeFilter, search]);

  const livePaidRevenue = useMemo(
    () =>
      transactions
        .filter((t) => t.stripeLivemode && t.paymentStatus === "paid")
        .reduce((s, t) => s + t.total, 0),
    [transactions]
  );
  const authorizedHolds = useMemo(
    () =>
      transactions
        .filter((t) => t.paymentStatus === "authorized")
        .reduce((s, t) => s + t.total, 0),
    [transactions]
  );
  const refundedCount = useMemo(
    () => transactions.filter((t) => t.paymentStatus === "refunded").length,
    [transactions]
  );
  const sandboxCount = useMemo(
    () => transactions.filter((t) => !t.stripeLivemode).length,
    [transactions]
  );

  const exportCsv = () => {
    const rows: unknown[][] = [
      [
        "Date",
        "Buyer name",
        "Buyer email",
        "Buyer phone",
        "Items",
        "Amount",
        "Mode",
        "Payment status",
        "Fulfillment",
        "Stripe payment intent",
        "Stripe session",
        "Refund ID",
        "Capture error",
        "Order ID",
      ],
      ...filtered.map((t) => [
        t.createdAt ?? "",
        t.buyerName,
        t.buyerEmail,
        t.buyerPhone,
        itemsSummary(t),
        t.total,
        t.stripeLivemode ? "live" : "sandbox",
        t.paymentStatus,
        t.fulfillmentStatus,
        t.stripePaymentIntentId ?? "",
        t.stripeSessionId,
        t.stripeRefundId ?? "",
        t.captureError ?? "",
        t.id,
      ]),
    ];
    downloadCsv(`shop-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shop Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Accounting ledger for merch orders. Capture, release, and refund from{" "}
            <Link href="/admin/shop" className="underline hover:text-foreground">
              Admin → Manage Shop
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={filtered.length === 0}
            onClick={exportCsv}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtAmount(livePaidRevenue)}</p>
              <p className="text-xs text-muted-foreground">Live paid revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/30">
              <ShoppingBag className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtAmount(authorizedHolds)}</p>
              <p className="text-xs text-muted-foreground">Authorized holds</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
              <FlaskConical className="h-5 w-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{sandboxCount}</p>
              <p className="text-xs text-muted-foreground">Sandbox orders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30">
              <TrendingUp className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{refundedCount}</p>
              <p className="text-xs text-muted-foreground">Refunded orders</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, email, phone, items, id"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="authorized">Authorized</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="capture_failed">Capture failed</SelectItem>
            <SelectItem value="pending_repay">Pending re-pay</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="live">Live only</SelectItem>
            <SelectItem value="sandbox">Sandbox</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Date</th>
              <th className="p-3">Buyer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Mode</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Fulfillment</th>
              <th className="p-3">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No shop transactions match.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const stripeHref = tx.stripePaymentIntentId
                  ? `https://dashboard.stripe.com/${tx.stripeLivemode ? "" : "test/"}payments/${tx.stripePaymentIntentId}`
                  : null;
                return (
                  <tr key={tx.id} className="border-b align-top">
                    <td className="whitespace-nowrap p-3">{fmtDate(tx.createdAt)}</td>
                    <td className="p-3">
                      <p className="font-medium">{tx.buyerName}</p>
                      <p className="text-xs text-muted-foreground">{tx.buyerEmail}</p>
                      {tx.buyerPhone ? (
                        <p className="text-xs text-muted-foreground">{tx.buyerPhone}</p>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <ul className="space-y-1 text-xs">
                        {tx.lines.map((l, i) => {
                          const custom = l.customization
                            ? [
                                l.customization.jerseyName,
                                l.customization.jerseyNumber
                                  ? `#${l.customization.jerseyNumber}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")
                            : "";
                          return (
                            <li key={i}>
                              {l.qty}× {l.name} (
                              {l.color?.trim() ? `${l.size}/${l.color}` : l.size})
                              {custom ? (
                                <span className="block text-muted-foreground">Custom: {custom}</span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="p-3 font-semibold">{fmtAmount(tx.total)}</td>
                    <td className="p-3">
                      {tx.stripeLivemode ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                          Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-900/20 dark:text-yellow-400">
                          <FlaskConical className="h-3 w-3" />
                          Sandbox
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{tx.paymentStatus}</Badge>
                      {tx.captureError ? (
                        <p className="mt-1 max-w-[180px] text-xs text-destructive">
                          {tx.captureError}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 text-muted-foreground">{tx.fulfillmentStatus}</td>
                    <td className="p-3">
                      {stripeHref ? (
                        <a
                          href={stripeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
