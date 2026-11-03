"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { ShopOrder } from "@/lib/shop/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";

type StatusFilter = "all" | "authorized" | "paid" | "released" | "refunded";

export default function ShopTransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("authorized");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
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
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        t.buyerName.toLowerCase().includes(q) ||
        t.buyerEmail.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [transactions, statusFilter, search]);

  const act = async (id: string, action: "capture" | "release" | "refund") => {
    if (!user) return;
    setBusyId(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/super-admin/shop-transactions/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shop Transactions</h1>
          <p className="text-muted-foreground">
            Authorize holds, capture charges, release, and refund merch orders.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name, email, id"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="authorized">Authorized</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Buyer</th>
                <th className="p-3">Items</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Stripe</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
                      <td className="p-3 whitespace-nowrap">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{tx.buyerName}</p>
                        <p className="text-xs text-muted-foreground">{tx.buyerEmail}</p>
                        <p className="text-xs text-muted-foreground">{tx.buyerPhone}</p>
                      </td>
                      <td className="p-3">
                        <ul className="space-y-1 text-xs">
                          {tx.lines.map((l, i) => (
                            <li key={i}>
                              {l.qty}× {l.name} ({l.size}/{l.color})
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-3 font-semibold">${tx.total.toFixed(2)}</td>
                      <td className="p-3">
                        <Badge variant="outline">{tx.paymentStatus}</Badge>
                        {tx.captureError ? (
                          <p className="mt-1 max-w-[200px] text-xs text-destructive">
                            {tx.captureError}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">{tx.fulfillmentStatus}</p>
                      </td>
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
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {tx.paymentStatus === "authorized" ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7"
                                disabled={busyId === tx.id}
                                onClick={() => void act(tx.id, "capture")}
                              >
                                Capture
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                disabled={busyId === tx.id}
                                onClick={() => void act(tx.id, "release")}
                              >
                                Release
                              </Button>
                            </>
                          ) : null}
                          {tx.paymentStatus === "paid" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-destructive"
                              disabled={busyId === tx.id}
                              onClick={() => void act(tx.id, "refund")}
                            >
                              Refund
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
