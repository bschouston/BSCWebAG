"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { formatTierPrice, TIER_CARD_COLOR_PRESETS, normalizeTierCardColor } from "@/lib/token-tiers";
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

type Tier = {
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
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const res = await fetch("/api/super-admin/token-tiers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load tiers");
      setTiers(data.tiers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTier = async () => {
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
      const res = await fetch("/api/super-admin/token-tiers", {
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
      if (!res.ok) throw new Error(data.error || "Failed to create tier");
      setLabel("");
      setMsg("Tier created.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = async (tier: Tier) => {
    setError(null);
    setMsg(null);
    try {
      const next = editingLabelValue.trim();
      const res = await fetch(`/api/super-admin/token-tiers/${tier.id}`, {
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

  const saveCardColor = async (tier: Tier, nextColor: string) => {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/token-tiers/${tier.id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ cardColor: nextColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update color");
      setTiers((prev) =>
        prev.map((t) => (t.id === tier.id ? { ...t, cardColor: nextColor } : t))
      );
      setMsg("Card color updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update color");
    }
  };

  const toggleActive = async (tier: Tier) => {
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/token-tiers/${tier.id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ active: !tier.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setMsg(tier.active ? "Tier deactivated." : "Tier activated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const deactivate = async (tier: Tier) => {
    if (!confirm(`Deactivate ${tier.tokenAmount}-token tier?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/token-tiers/${tier.id}`, {
        method: "DELETE",
        headers: await headers(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to deactivate");
      setMsg("Tier deactivated.");
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
          Super Admin only. Members buy and auto-replenish using these tiers. Replenish amounts must
          match an active tier&apos;s token count.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add tier</CardTitle>
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
                {TIER_CARD_COLOR_PRESETS.map((preset) => (
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
            <Button className="w-full" disabled={saving} onClick={() => void createTier()}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Add tier"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tiers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tiers yet. Add one above.</p>
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
                {tiers.map((tier) => (
                  <TableRow key={tier.id}>
                    <TableCell className="font-medium">{tier.tokenAmount}</TableCell>
                    <TableCell>{formatTierPrice(tier.priceCents, tier.currency)}</TableCell>
                    <TableCell>
                      {editingLabelId === tier.id ? (
                        <div className="flex max-w-xs items-center gap-2">
                          <Input
                            value={editingLabelValue}
                            onChange={(e) => setEditingLabelValue(e.target.value)}
                            placeholder="Optional label"
                            className="h-8"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveLabel(tier);
                              if (e.key === "Escape") setEditingLabelId(null);
                            }}
                          />
                          <Button size="sm" onClick={() => void saveLabel(tier)}>
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
                            setEditingLabelId(tier.id);
                            setEditingLabelValue(tier.label || "");
                          }}
                          title="Edit label"
                        >
                          {tier.label || (
                            <span className="text-muted-foreground">Add label…</span>
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeTierCardColor(tier.cardColor)}
                          onChange={(e) => {
                            const next = e.target.value;
                            setTiers((prev) =>
                              prev.map((t) => (t.id === tier.id ? { ...t, cardColor: next } : t))
                            );
                          }}
                          onBlur={(e) => void saveCardColor(tier, e.target.value)}
                          className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                          title="Card color on member wallet"
                        />
                        <div className="flex gap-1">
                          {TIER_CARD_COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              title={preset.label}
                              onClick={() => void saveCardColor(tier, preset.value)}
                              className="h-5 w-5 rounded border"
                              style={{ background: preset.value }}
                            />
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tier.active ? "outline" : "secondary"}>
                        {tier.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{tier.sortOrder}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleActive(tier)}
                      >
                        {tier.active ? "Deactivate" : "Activate"}
                      </Button>
                      {tier.active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deactivate(tier)}
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
