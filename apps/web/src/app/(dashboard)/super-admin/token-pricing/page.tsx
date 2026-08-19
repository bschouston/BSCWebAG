"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  formatPackagePrice,
  PACKAGE_CARD_COLOR_PRESETS,
  normalizePackageCardColor,
} from "@/lib/token-packages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";

type PackageRow = {
  id: string;
  tokenAmount: number;
  priceCents: number;
  currency: string;
  active: boolean;
  sortOrder: number;
  label?: string | null;
  cardColor?: string | null;
};

export default function TokenPricingPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [unitPriceDollars, setUnitPriceDollars] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tokenAmount, setTokenAmount] = useState("10");
  const [priceDollars, setPriceDollars] = useState("15.00");
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [cardColor, setCardColor] = useState("#1a3556");

  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");

  const headers = useCallback(async () => {
    const token = await user!.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const auth = { Authorization: `Bearer ${token}` };
      const [pkgRes, configRes] = await Promise.all([
        fetch("/api/super-admin/token-packages", { headers: auth }),
        fetch("/api/super-admin/token-pricing-config", { headers: auth }),
      ]);
      const pkgData = await pkgRes.json().catch(() => ({}));
      const configData = await configRes.json().catch(() => ({}));
      if (!pkgRes.ok) throw new Error(pkgData.error || "Failed to load packages");
      setPackages(pkgData.packages ?? []);
      const unitCents = Number(configData.config?.unitPriceCents) || 0;
      setUnitPriceDollars(unitCents > 0 ? (unitCents / 100).toFixed(2) : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveUnitPrice = async () => {
    setUnitSaving(true);
    setError(null);
    setMsg(null);
    try {
      const dollars = Number(unitPriceDollars);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        throw new Error("Unit price must be a positive dollar amount");
      }
      const res = await fetch("/api/super-admin/token-pricing-config", {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({ unitPriceCents: Math.round(dollars * 100) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save unit price");
      setMsg("Unit token price saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save unit price");
    } finally {
      setUnitSaving(false);
    }
  };

  const createPackage = async () => {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const amount = Number(tokenAmount);
      const dollars = Number(priceDollars);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("Token amount must be a positive whole number");
      }
      if (!Number.isFinite(dollars) || dollars < 0) {
        throw new Error("Price must be a valid dollar amount");
      }
      const priceCents = Math.round(dollars * 100);
      const res = await fetch("/api/super-admin/token-packages", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({
          tokenAmount: amount,
          priceCents,
          label: label.trim() || null,
          sortOrder: Number(sortOrder) || 0,
          active: true,
          cardColor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create package");
      setLabel("");
      setMsg("Package created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = async (pkg: PackageRow) => {
    setError(null);
    setMsg(null);
    try {
      const next = editingLabelValue.trim();
      const res = await fetch(`/api/super-admin/token-packages/${pkg.id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ label: next || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update label");
      setEditingLabelId(null);
      setMsg("Label updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update label");
    }
  };

  const saveCardColor = async (pkg: PackageRow, nextColor: string) => {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/token-packages/${pkg.id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ cardColor: nextColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update color");
      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? { ...p, cardColor: nextColor } : p))
      );
      setMsg("Card color updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update color");
    }
  };

  const toggleActive = async (pkg: PackageRow) => {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/token-packages/${pkg.id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ active: !pkg.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setMsg(pkg.active ? "Package deactivated." : "Package activated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const deactivate = async (pkg: PackageRow) => {
    if (!confirm(`Deactivate ${pkg.tokenAmount}-token package?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/token-packages/${pkg.id}`, {
        method: "DELETE",
        headers: await headers(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to deactivate");
      setMsg("Package deactivated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading pricing…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Token pricing</h1>
        <p className="text-sm text-muted-foreground">
          Super Admin only. Set the unit token price for exact RSVP purchases and manage token
          packages members can buy or select for auto replenish.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Unit token price</CardTitle>
          <CardDescription>
            Price for 1 token when a member buys the exact number needed at RSVP (separate from
            packages).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:max-w-xs">
            <Label htmlFor="unitPrice">Price per 1 token (USD)</Label>
            <Input
              id="unitPrice"
              type="number"
              min={0.01}
              step="0.01"
              placeholder="1.75"
              value={unitPriceDollars}
              onChange={(e) => setUnitPriceDollars(e.target.value)}
            />
          </div>
          <Button disabled={unitSaving} onClick={() => void saveUnitPrice()}>
            {unitSaving ? "Saving…" : "Save unit price"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add package</CardTitle>
          <CardDescription>Example: 10 tokens for $15.00</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="tokenAmount">Tokens</Label>
            <Input
              id="tokenAmount"
              type="number"
              min={1}
              step={1}
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (USD)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label (optional)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Starter"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort">Sort order</Label>
            <Input
              id="sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cardColor">Card color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cardColor"
                type="color"
                value={cardColor}
                onChange={(e) => setCardColor(e.target.value)}
                className="h-10 w-14 cursor-pointer p-1"
              />
              <div className="flex flex-wrap gap-1">
                {PACKAGE_CARD_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                    onClick={() => setCardColor(preset.value)}
                    className="h-6 w-6 rounded border"
                    style={{ background: preset.value }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={saving} onClick={() => void createPackage()}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Add package"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet. Add one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Card color</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.tokenAmount}</TableCell>
                    <TableCell>{formatPackagePrice(pkg.priceCents, pkg.currency)}</TableCell>
                    <TableCell>
                      {editingLabelId === pkg.id ? (
                        <div className="flex max-w-xs items-center gap-2">
                          <Input
                            value={editingLabelValue}
                            onChange={(e) => setEditingLabelValue(e.target.value)}
                            placeholder="Optional label"
                            className="h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveLabel(pkg);
                              if (e.key === "Escape") setEditingLabelId(null);
                            }}
                          />
                          <Button size="sm" onClick={() => void saveLabel(pkg)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingLabelId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => {
                            setEditingLabelId(pkg.id);
                            setEditingLabelValue(pkg.label || "");
                          }}
                          title="Edit label"
                        >
                          {pkg.label || (
                            <span className="text-muted-foreground">Add label…</span>
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizePackageCardColor(pkg.cardColor)}
                          onChange={(e) => {
                            const next = e.target.value;
                            setPackages((prev) =>
                              prev.map((p) => (p.id === pkg.id ? { ...p, cardColor: next } : p))
                            );
                          }}
                          onBlur={(e) => void saveCardColor(pkg, e.target.value)}
                          className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                          title="Card color on member wallet"
                        />
                        <div className="flex gap-1">
                          {PACKAGE_CARD_COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              title={preset.label}
                              onClick={() => void saveCardColor(pkg, preset.value)}
                              className="h-5 w-5 rounded border"
                              style={{ background: preset.value }}
                            />
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={pkg.active ? "outline" : "secondary"}>
                        {pkg.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{pkg.sortOrder}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleActive(pkg)}
                      >
                        {pkg.active ? "Deactivate" : "Activate"}
                      </Button>
                      {pkg.active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deactivate(pkg)}
                        >
                          Soft delete
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
