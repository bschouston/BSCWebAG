"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  PackageCheck,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ShopOrder, ShopProduct, ShopSettings } from "@/lib/shop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminShopPage() {
  const { user, profile } = useAuth();
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [summary, setSummary] = useState<{
    orderCount: number;
    totalUnits: number;
    rows: { name: string; size: string; color: string; sku: string; qty: number }[];
  } | null>(null);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    const headers = await authHeaders();
    const [p, o, s, set] = await Promise.all([
      fetch("/api/admin/shop/products", { headers }).then((r) => r.json()),
      fetch("/api/admin/shop/orders", { headers }).then((r) => r.json()),
      fetch("/api/admin/shop/orders/summary", { headers }).then((r) => r.json()),
      fetch("/api/admin/shop/settings", { headers }).then((r) => r.json()),
    ]);
    setProducts(p.products ?? []);
    setOrders(o.orders ?? []);
    setSummary(s.rows ? s : null);
    setSettings(set.settings ?? null);
  }, [user, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setMsg(null);
    const headers = {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    };
    const res = await fetch("/api/admin/shop/settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Save failed");
      return;
    }
    setSettings(data.settings);
    setMsg("Settings saved");
  };

  const patchFulfillment = async (id: string, fulfillmentStatus: "ready" | "picked_up") => {
    const headers = {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    };
    await fetch(`/api/admin/shop/orders/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fulfillmentStatus }),
    });
    await load();
  };

  const moneyAct = async (id: string, action: "capture" | "release" | "refund") => {
    if (!isSuperAdmin || !user) return;
    const labels = { capture: "Capture", release: "Release", refund: "Refund" } as const;
    const ok = window.confirm(`${labels[action]} this shop order?`);
    if (!ok) return;
    setBusyId(id);
    setMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/super-admin/shop-transactions/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${labels[action]} failed`);
      setMsg(`${labels[action]} succeeded.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${labels[action]} failed`);
    } finally {
      setBusyId(null);
    }
  };

  const deleteProduct = async (p: ShopProduct) => {
    const ok = window.confirm(
      `Delete “${p.name}”? If it has reserved inventory from orders, it will be archived instead.`
    );
    if (!ok) return;
    setMsg(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/shop/products/${p.id}`, {
      method: "DELETE",
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Delete failed");
      return;
    }
    setMsg(data.archived ? `“${p.name}” archived (had reserved stock).` : `“${p.name}” deleted.`);
    await load();
  };

  const downloadCsv = () => {
    if (!summary?.rows.length) return;
    const header = "Product,Size,Color,SKU,Qty\n";
    const body = summary.rows
      .map((r) =>
        [r.name, r.size, r.color, r.sku, r.qty].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shop-bulk-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Shop</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin
              ? "Catalog, order window, capture/release/refund, and handout."
              : "Catalog, order window, and handout for paid orders."}
          </p>
        </div>
        <Button asChild size="icon" className="bg-[#1a3556] text-white" title="New product">
          <Link href="/admin/shop/new" aria-label="New product">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="bulk">Bulk summary</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          {products.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              No products yet. Add your first product to start a merch run.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.category}</td>
                      <td className="p-3">${p.basePrice.toFixed(2)}</td>
                      <td className="p-3">
                        <Badge variant="outline">{p.status}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" title="Edit">
                            <Link href={`/admin/shop/${p.id}`} aria-label={`Edit ${p.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => void deleteProduct(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Buyer</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Fulfillment</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No orders yet.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const stripeHref = o.stripePaymentIntentId
                      ? `https://dashboard.stripe.com/${o.stripeLivemode ? "" : "test/"}payments/${o.stripePaymentIntentId}`
                      : null;
                    return (
                      <tr key={o.id} className="border-b align-top">
                        <td className="p-3">
                          <p className="font-medium">{o.buyerName}</p>
                          <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                          {o.buyerPhone ? (
                            <p className="text-xs text-muted-foreground">{o.buyerPhone}</p>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <ul className="space-y-1 text-xs">
                            {o.lines.map((l, i) => {
                              const custom = [
                                l.customization?.jerseyName,
                                l.customization?.jerseyNumber
                                  ? `#${l.customization.jerseyNumber}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ");
                              return (
                                <li key={i}>
                                  {l.qty}× {l.name} (
                                  {l.color?.trim() ? `${l.size}/${l.color}` : l.size})
                                  {custom ? (
                                    <span className="block text-[#8a6d00] dark:text-[#ffd700]">
                                      Custom: {custom}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                        <td className="p-3">${o.total.toFixed(2)}</td>
                        <td className="p-3">
                          <Badge variant="outline">{o.paymentStatus}</Badge>
                          {o.paymentStatus === "authorized" && !isSuperAdmin ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Awaiting capture
                            </p>
                          ) : null}
                          {o.captureError ? (
                            <p className="mt-1 max-w-[200px] text-xs text-destructive">
                              {o.captureError}
                            </p>
                          ) : null}
                          {o.paymentStatus === "capture_failed" ||
                          o.paymentStatus === "pending_repay" ? (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Awaiting buyer re-pay
                            </p>
                          ) : null}
                          {isSuperAdmin && stripeHref ? (
                            <a
                              href={stripeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Stripe <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </td>
                        <td className="p-3">{o.fulfillmentStatus}</td>
                        <td className="p-3">
                          <div className="flex flex-col items-start gap-1">
                            {isSuperAdmin && o.paymentStatus === "authorized" ? (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
                                  disabled={busyId === o.id}
                                  onClick={() => void moneyAct(o.id, "capture")}
                                >
                                  Capture
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  disabled={busyId === o.id}
                                  onClick={() => void moneyAct(o.id, "release")}
                                >
                                  Release
                                </Button>
                              </div>
                            ) : null}
                            {isSuperAdmin && o.paymentStatus === "paid" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-destructive"
                                disabled={busyId === o.id}
                                onClick={() => void moneyAct(o.id, "refund")}
                              >
                                Refund
                              </Button>
                            ) : null}
                            {o.paymentStatus === "paid" ? (
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="Mark ready"
                                  aria-label="Mark ready for pickup"
                                  onClick={() => void patchFulfillment(o.id, "ready")}
                                >
                                  <PackageCheck className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="Mark picked up"
                                  aria-label="Mark picked up"
                                  onClick={() => void patchFulfillment(o.id, "picked_up")}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : null}
                            {o.paymentStatus !== "paid" &&
                            !(isSuperAdmin && o.paymentStatus === "authorized") ? (
                              <span className="text-xs text-muted-foreground">—</span>
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
        </TabsContent>

        <TabsContent value="bulk" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Paid orders only: {summary?.orderCount ?? 0} orders · {summary?.totalUnits ?? 0} units
            </p>
            <Button
              size="icon"
              variant="outline"
              onClick={downloadCsv}
              disabled={!summary?.rows.length}
              title="Download CSV"
              aria-label="Download CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Product</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Color</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Qty</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.rows ?? []).map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3">{r.name}</td>
                    <td className="p-3">{r.size}</td>
                    <td className="p-3">{r.color?.trim() ? r.color : "—"}</td>
                    <td className="p-3 font-mono text-xs">{r.sku}</td>
                    <td className="p-3 font-semibold">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 rounded-lg border bg-card p-6 max-w-xl">
          {settings ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.shopEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, shopEnabled: e.target.checked })
                  }
                />
                Shop enabled
              </label>
              <div className="space-y-1">
                <Label>Season title</Label>
                <Input
                  value={settings.seasonTitle}
                  onChange={(e) => setSettings({ ...settings, seasonTitle: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Order opens at (ISO / local datetime)</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(settings.orderOpensAt)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      orderOpensAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Order closes at</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(settings.orderClosesAt)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      orderClosesAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Fulfillment instructions (required to enable)</Label>
                <Textarea
                  rows={4}
                  value={settings.fulfillmentInstructions}
                  onChange={(e) =>
                    setSettings({ ...settings, fulfillmentInstructions: e.target.value })
                  }
                  placeholder="How and when buyers receive their items"
                />
              </div>
              {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
              <Button className="bg-[#1a3556] text-white" onClick={() => void saveSettings()}>
                Save settings
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
