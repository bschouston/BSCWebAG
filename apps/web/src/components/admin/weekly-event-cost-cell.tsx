"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

function fmtUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/**
 * SuperAdmin-only inline editor for weekly occurrence `actualCostUsd`.
 * Editable for any status (including past / completed / cancelled).
 */
export function WeeklyEventCostCell({
  eventId,
  initialCost,
  onSaved,
  compact = false,
}: {
  eventId: string;
  initialCost: number | null | undefined;
  onSaved?: (cost: number | null) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    initialCost == null ? "" : String(initialCost)
  );
  const [cost, setCost] = useState<number | null>(
    typeof initialCost === "number" && Number.isFinite(initialCost) ? initialCost : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next =
      typeof initialCost === "number" && Number.isFinite(initialCost) ? initialCost : null;
    setCost(next);
    if (!editing) setValue(next == null ? "" : String(next));
  }, [initialCost, editing]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const trimmed = value.trim();
      const body =
        trimmed === ""
          ? { actualCostUsd: null }
          : { actualCostUsd: Number(trimmed) };
      const res = await fetch(`/api/super-admin/weekly-events/${eventId}/cost`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save cost");
      const next =
        typeof data.actualCostUsd === "number" ? data.actualCostUsd : null;
      setCost(next);
      setEditing(false);
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save cost");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className={compact ? "space-y-1" : "space-y-1 min-w-[7rem]"}>
        <button
          type="button"
          className="tabular-nums text-sm font-medium text-[#1a3556] underline-offset-2 hover:underline dark:text-foreground"
          onClick={() => {
            setValue(cost == null ? "" : String(cost));
            setEditing(true);
            setError(null);
          }}
          title="Edit cost (Super Admin)"
        >
          {fmtUsd(cost)}
        </button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "min-w-[9rem] space-y-1"}>
      <div className="flex flex-wrap items-center gap-1">
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="h-8 w-24 text-sm tabular-nums"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setEditing(false);
              setError(null);
            }
          }}
          aria-label="Actual event cost USD"
        />
        <Button
          type="button"
          size="sm"
          className="h-8 bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
