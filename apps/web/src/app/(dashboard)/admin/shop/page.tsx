"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import type { ShopOrder, ShopProduct, ShopSettings } from "@/lib/shop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminShopPage() {
  const { user } = useAuth();
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
            Catalog, order window, handout — money capture is in Super Admin → Shop Transactions.
          </p>
        </div>
        <Button asChild className="bg-[#1a3556] text-white">
          <Link href="/admin/shop/new">New product</Link>
        </Button>
      </div>

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
                        <Link className="text-primary underline" href={`/admin/shop/${p.id}`}>
                          Edit
                        </Link>
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
                  <th className="p-3">Total</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Fulfillment</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders
                  .filter((o) => o.paymentStatus !== "pending_checkout" as string)
                  .map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-3">
                        <p className="font-medium">{o.buyerName}</p>
                        <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                      </td>
                      <td className="p-3">${o.total.toFixed(2)}</td>
                      <td className="p-3">
                        <Badge variant="outline">{o.paymentStatus}</Badge>
                        {o.paymentStatus === "authorized" ? (
                          <p className="mt-1 text-xs text-muted-foreground">Awaiting Super Admin</p>
                        ) : null}
                      </td>
                      <td className="p-3">{o.fulfillmentStatus}</td>
                      <td className="p-3">
                        {o.paymentStatus === "paid" ? (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => void patchFulfillment(o.id, "ready")}>
                              Ready
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void patchFulfillment(o.id, "picked_up")}
                            >
                              Picked up
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Paid orders only: {summary?.orderCount ?? 0} orders · {summary?.totalUnits ?? 0} units
            </p>
            <Button variant="outline" onClick={downloadCsv} disabled={!summary?.rows.length}>
              Download CSV
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
                    <td className="p-3">{r.color}</td>
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
