"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { downloadCsv } from "@/lib/csv";
import { lineUnitAmount, type ShopOrder, type ShopProduct, type ShopSettings } from "@/lib/shop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PaymentFilter =
  | "all"
  | "authorized"
  | "paid"
  | "released"
  | "refunded"
  | "capture_failed"
  | "pending_repay";
type FulfillmentFilter =
  | "all"
  | "pending_review"
  | "ready"
  | "picked_up"
  | "rejected"
  | "cancelled";
type CustomFilter = "all" | "yes" | "no";
type SortKey =
  | "newest"
  | "oldest"
  | "buyer"
  | "product"
  | "size"
  | "jerseyName"
  | "amountHigh"
  | "amountLow";

type OrderLineRow = {
  key: string;
  order: ShopOrder;
  lineIndex: number;
  product: string;
  size: string;
  color: string;
  sku: string;
  qty: number;
  jerseyName: string;
  jerseyNumber: string;
  unitPrice: number;
  customizationFee: number;
  lineTotal: number;
  isCustom: boolean;
};

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

export default function AdminShopPage() {
  const { user, profile } = useAuth();
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>("all");
  const [productFilter, setProductFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [customFilter, setCustomFilter] = useState<CustomFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    const headers = await authHeaders();
    const [p, o, set] = await Promise.all([
      fetch("/api/admin/shop/products", { headers }).then((r) => r.json()),
      fetch("/api/admin/shop/orders", { headers }).then((r) => r.json()),
      fetch("/api/admin/shop/settings", { headers }).then((r) => r.json()),
    ]);
    setProducts(p.products ?? []);
    setOrders(o.orders ?? []);
    setSettings(set.settings ?? null);
  }, [user, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineRows = useMemo(() => {
    const rows: OrderLineRow[] = [];
    for (const order of orders) {
      order.lines.forEach((line, lineIndex) => {
        const jerseyName = (line.customization?.jerseyName ?? "").trim();
        const jerseyNumber = (line.customization?.jerseyNumber ?? "").trim();
        const unit = lineUnitAmount(line);
        rows.push({
          key: `${order.id}:${lineIndex}`,
          order,
          lineIndex,
          product: line.name,
          size: line.size,
          color: (line.color ?? "").trim(),
          sku: line.sku,
          qty: line.qty,
          jerseyName,
          jerseyNumber,
          unitPrice: line.unitPrice,
          customizationFee: line.customizationFee || 0,
          lineTotal: unit * line.qty,
          isCustom: Boolean(jerseyName || jerseyNumber),
        });
      });
    }
    return rows;
  }, [orders]);

  const productOptions = useMemo(
    () => [...new Set(lineRows.map((r) => r.product).filter(Boolean))].sort(),
    [lineRows]
  );
  const sizeOptions = useMemo(
    () => [...new Set(lineRows.map((r) => r.size).filter(Boolean))].sort(),
    [lineRows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = lineRows.filter((r) => {
      if (paymentFilter !== "all" && r.order.paymentStatus !== paymentFilter) return false;
      if (fulfillmentFilter !== "all" && r.order.fulfillmentStatus !== fulfillmentFilter) {
        return false;
      }
      if (productFilter !== "all" && r.product !== productFilter) return false;
      if (sizeFilter !== "all" && r.size !== sizeFilter) return false;
      if (customFilter === "yes" && !r.isCustom) return false;
      if (customFilter === "no" && r.isCustom) return false;
      if (q) {
        const hay = [
          r.order.buyerName,
          r.order.buyerEmail,
          r.order.buyerPhone,
          r.order.id,
          r.product,
          r.size,
          r.color,
          r.sku,
          r.jerseyName,
          r.jerseyNumber,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      if (sortKey === "oldest") {
        return (a.order.createdAt || "").localeCompare(b.order.createdAt || "");
      }
      if (sortKey === "buyer") {
        return a.order.buyerName.localeCompare(b.order.buyerName) || a.product.localeCompare(b.product);
      }
      if (sortKey === "product") {
        return a.product.localeCompare(b.product) || a.size.localeCompare(b.size);
      }
      if (sortKey === "size") {
        return a.size.localeCompare(b.size) || a.product.localeCompare(b.product);
      }
      if (sortKey === "jerseyName") {
        return a.jerseyName.localeCompare(b.jerseyName) || a.jerseyNumber.localeCompare(b.jerseyNumber);
      }
      if (sortKey === "amountHigh") return b.lineTotal - a.lineTotal;
      if (sortKey === "amountLow") return a.lineTotal - b.lineTotal;
      return (b.order.createdAt || "").localeCompare(a.order.createdAt || "");
    });
    return rows;
  }, [
    lineRows,
    search,
    paymentFilter,
    fulfillmentFilter,
    productFilter,
    sizeFilter,
    customFilter,
    sortKey,
  ]);

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

  const exportOrdersCsv = () => {
    const rows: unknown[][] = [
      [
        "Date",
        "Order ID",
        "Buyer name",
        "Buyer email",
        "Buyer phone",
        "Product",
        "Size",
        "Color",
        "SKU",
        "Qty",
        "Jersey name",
        "Jersey number",
        "Unit price",
        "Customization fee",
        "Line total",
        "Payment status",
        "Fulfillment",
        "Capture error",
      ],
      ...filteredRows.map((r) => [
        r.order.createdAt ?? "",
        r.order.id,
        r.order.buyerName,
        r.order.buyerEmail,
        r.order.buyerPhone,
        r.product,
        r.size,
        r.color,
        r.sku,
        r.qty,
        r.jerseyName,
        r.jerseyNumber,
        r.unitPrice,
        r.customizationFee,
        r.lineTotal,
        r.order.paymentStatus,
        r.order.fulfillmentStatus,
        r.order.captureError ?? "",
      ]),
    ];
    downloadCsv(`shop-orders-${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search buyer, product, jersey, SKU, order id"
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={paymentFilter}
              onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="authorized">Authorized</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="capture_failed">Capture failed</SelectItem>
                <SelectItem value="pending_repay">Pending re-pay</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={fulfillmentFilter}
              onValueChange={(v) => setFulfillmentFilter(v as FulfillmentFilter)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Fulfillment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fulfillment</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="picked_up">Picked up</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {productOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sizeFilter} onValueChange={setSizeFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sizes</SelectItem>
                {sizeOptions.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={customFilter} onValueChange={(v) => setCustomFilter(v as CustomFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Custom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lines</SelectItem>
                <SelectItem value="yes">Customized</SelectItem>
                <SelectItem value="no">No custom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="buyer">Buyer A–Z</SelectItem>
                <SelectItem value="product">Product A–Z</SelectItem>
                <SelectItem value="size">Size</SelectItem>
                <SelectItem value="jerseyName">Jersey name</SelectItem>
                <SelectItem value="amountHigh">Amount high</SelectItem>
                <SelectItem value="amountLow">Amount low</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={filteredRows.length === 0}
              onClick={exportOrdersCsv}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredRows.length} line
            {filteredRows.length === 1 ? "" : "s"}
            {filteredRows.length !== lineRows.length ? ` (of ${lineRows.length})` : ""}
          </p>

          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Buyer</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Color</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Jersey name</th>
                  <th className="p-3">#</th>
                  <th className="p-3">Line total</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Fulfillment</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-muted-foreground">
                      No order lines match.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const o = r.order;
                    const stripeHref = o.stripePaymentIntentId
                      ? `https://dashboard.stripe.com/${o.stripeLivemode ? "" : "test/"}payments/${o.stripePaymentIntentId}`
                      : null;
                    return (
                      <tr key={r.key} className="border-b align-top">
                        <td className="whitespace-nowrap p-3 text-xs">{fmtDate(o.createdAt)}</td>
                        <td className="p-3">
                          <p className="font-medium">{o.buyerName}</p>
                          <p className="text-xs text-muted-foreground">{o.buyerEmail}</p>
                          {o.buyerPhone ? (
                            <p className="text-xs text-muted-foreground">{o.buyerPhone}</p>
                          ) : null}
                        </td>
                        <td className="p-3 font-medium">{r.product}</td>
                        <td className="p-3">{r.size}</td>
                        <td className="p-3">{r.color || "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.sku || "—"}</td>
                        <td className="p-3">{r.qty}</td>
                        <td className="p-3 text-[#8a6d00] dark:text-[#ffd700]">
                          {r.jerseyName || "—"}
                        </td>
                        <td className="p-3 text-[#8a6d00] dark:text-[#ffd700]">
                          {r.jerseyNumber || "—"}
                        </td>
                        <td className="p-3 font-semibold">${r.lineTotal.toFixed(2)}</td>
                        <td className="p-3">
                          <Badge variant="outline">{o.paymentStatus}</Badge>
                          {o.paymentStatus === "authorized" && !isSuperAdmin ? (
                            <p className="mt-1 text-xs text-muted-foreground">Awaiting capture</p>
                          ) : null}
                          {o.captureError ? (
                            <p className="mt-1 max-w-[160px] text-xs text-destructive">
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

        <TabsContent value="settings" className="max-w-xl space-y-4 rounded-lg border bg-card p-6">
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
