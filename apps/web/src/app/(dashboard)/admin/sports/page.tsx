"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CatalogItem } from "@/lib/sports-catalog";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Kind = "sport" | "skill";

export default function AdminSportsPage() {
  const { user } = useAuth();
  const [sports, setSports] = useState<CatalogItem[]>([]);
  const [skillLevels, setSkillLevels] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sportLabel, setSportLabel] = useState("");
  const [skillLabel, setSkillLabel] = useState("");

  const load = async () => {
    const token = await user?.getIdToken();
    const res = await fetch("/api/admin/sports-catalog", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load");
    setSports(data.sports || []);
    setSkillLevels(data.skillLevels || []);
  };

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authed = async (method: string, body: unknown) => {
    const token = await user?.getIdToken();
    const res = await fetch("/api/admin/sports-catalog", {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const addItem = async (kind: Kind, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const list = kind === "sport" ? sports : skillLevels;
      await authed("POST", {
        kind,
        label: trimmed,
        sortOrder: (list[list.length - 1]?.sortOrder ?? 0) + 10,
        active: true,
      });
      if (kind === "sport") setSportLabel("");
      else setSkillLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async (kind: Kind, item: CatalogItem) => {
    setBusy(true);
    setError(null);
    try {
      await authed("POST", {
        kind,
        id: item.id,
        slug: item.slug,
        label: item.label,
        sortOrder: item.sortOrder,
        active: item.active,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (kind: Kind, id: string) => {
    if (!confirm("Remove this item?")) return;
    setBusy(true);
    setError(null);
    try {
      await authed("DELETE", { kind, id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const updateLocal = (kind: Kind, id: string, patch: Partial<CatalogItem>) => {
    const setter = kind === "sport" ? setSports : setSkillLevels;
    setter((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const renderTable = (kind: Kind, rows: CatalogItem[]) => (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead className="w-28">Order</TableHead>
            <TableHead className="w-24">Active</TableHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Input
                  value={row.label}
                  onChange={(e) => updateLocal(kind, row.id, { label: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">{row.slug}</p>
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={row.sortOrder}
                  onChange={(e) =>
                    updateLocal(kind, row.id, { sortOrder: Number(e.target.value) || 0 })
                  }
                />
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={row.active}
                  onCheckedChange={(v) => updateLocal(kind, row.id, { active: v === true })}
                />
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveItem(kind, row)}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void removeItem(kind, row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading sports…
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Manage Sports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These lists power member profiles and weekly event sport selection.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sports</h2>
        {renderTable("sport", sports)}
        <div className="flex max-w-md gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="newSport">Add sport</Label>
            <Input
              id="newSport"
              value={sportLabel}
              onChange={(e) => setSportLabel(e.target.value)}
              placeholder="e.g. Padel"
            />
          </div>
          <Button
            className="mt-6"
            disabled={busy || !sportLabel.trim()}
            onClick={() => void addItem("sport", sportLabel)}
          >
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Skill levels</h2>
        {renderTable("skill", skillLevels)}
        <div className="flex max-w-md gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="newSkill">Add skill level</Label>
            <Input
              id="newSkill"
              value={skillLabel}
              onChange={(e) => setSkillLabel(e.target.value)}
              placeholder="e.g. Recreational"
            />
          </div>
          <Button
            className="mt-6"
            disabled={busy || !skillLabel.trim()}
            onClick={() => void addItem("skill", skillLabel)}
          >
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
      </section>
    </div>
  );
}
