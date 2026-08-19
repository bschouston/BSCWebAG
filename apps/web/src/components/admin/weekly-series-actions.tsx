"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Copy, Pause, Play, Trash2 } from "lucide-react";

type WeeklySeriesActionsProps = {
  seriesId: string;
  paused: boolean;
  title: string;
  onChanged?: () => void;
};

export function WeeklySeriesActions({ seriesId, paused, title, onChanged }: WeeklySeriesActionsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patchPaused(nextPaused: boolean) {
    const action = nextPaused ? "Pause" : "Resume";
    if (
      !confirm(
        `${action} the series “${title}”? ${
          nextPaused
            ? "No new weeks will be generated. Weeks already on the calendar stay until you manage or cancel them."
            : "New weeks will be generated for the usual 8-week horizon."
        }`
      )
    ) {
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-series/${seriesId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paused: nextPaused }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to update series");
      }
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update series");
    } finally {
      setBusy(false);
    }
  }

  function duplicateSeries() {
    if (
      !confirm(
        `Duplicate “${title}” into a new series? The next screen is prefilled from this series. You will still enter a new slug, first date, and optional end date.`
      )
    ) {
      return;
    }
    router.push(`/admin/events/new?fromSeries=${encodeURIComponent(seriesId)}`);
  }

  async function deleteSeries() {
    if (
      !confirm(
        `Delete the series “${title}”? This removes the template and any future weeks whose RSVP window has not opened yet. Past weeks and weeks with RSVP already open stay on the calendar.`
      )
    ) {
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-series/${seriesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete series");
      }
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete series");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
        Entire series: {title}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          aria-label={paused ? `Resume series ${title}` : `Pause series ${title}`}
          onClick={() => void patchPaused(!paused)}
        >
          {paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
          {paused ? "Resume series" : "Pause series"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          aria-label={`Duplicate series ${title}`}
          onClick={duplicateSeries}
        >
          <Copy className="mr-1 h-4 w-4" />
          Duplicate series
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="text-destructive hover:text-destructive disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          aria-label={`Delete series ${title}`}
          onClick={() => void deleteSeries()}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete series
        </Button>
      </div>
    </div>
  );
}
