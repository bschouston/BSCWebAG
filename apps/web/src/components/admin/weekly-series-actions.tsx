"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Pause, Pencil, Play, Trash2 } from "lucide-react";

type WeeklySeriesActionsProps = {
  seriesId: string;
  paused: boolean;
  title: string;
  /** Card label (adminLabel || title). */
  cardTitle: string;
  onChanged?: () => void;
};

export function WeeklySeriesActions({
  seriesId,
  paused,
  title,
  cardTitle,
  onChanged,
}: WeeklySeriesActionsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(cardTitle);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  async function patchPaused(nextPaused: boolean) {
    const action = nextPaused ? "Pause" : "Resume";
    if (
      !confirm(
        `${action} the series “${cardTitle}”? ${
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
        `Duplicate “${cardTitle}” into a new series? The next screen is prefilled from this series. You will still enter a new slug, first date, and optional end date.`
      )
    ) {
      return;
    }
    router.push(`/admin/events/new?fromSeries=${encodeURIComponent(seriesId)}`);
  }

  function closeDeleteSeries() {
    setDeleteOpen(false);
    setDeleteTyped("");
    setDeleteError(null);
    setDeleteResult(null);
  }

  async function confirmDeleteSeries() {
    if (!user) return;
    setBusy(true);
    setDeleteError(null);
    setDeleteResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-series/${seriesId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete series");
      }
      const deleted = typeof data.deletedEvents === "number" ? data.deletedEvents : 0;
      const skipped = typeof data.skippedEvents === "number" ? data.skippedEvents : 0;
      setDeleteResult(
        `Series deleted. Removed ${deleted} future week(s); kept ${skipped} week(s) that were not safely deletable.`
      );
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete series");
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    if (!user) return;
    const next = renameValue.trim();
    setBusy(true);
    setRenameError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-series/${seriesId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminLabel: next === title.trim() || !next ? null : next,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to rename series");
      }
      setRenameOpen(false);
      onChanged?.();
      router.refresh();
    } catch (err) {
      console.error(err);
      setRenameError(err instanceof Error ? err.message : "Failed to rename series");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <p className="mb-2 text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">
        Entire series: {cardTitle}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          aria-label={`Rename series ${cardTitle}`}
          onClick={() => {
            setRenameValue(cardTitle);
            setRenameError(null);
            setRenameOpen(true);
          }}
        >
          <Pencil className="mr-1 h-4 w-4" />
          Rename series
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          aria-label={paused ? `Resume series ${cardTitle}` : `Pause series ${cardTitle}`}
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
          aria-label={`Duplicate series ${cardTitle}`}
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
          aria-label={`Delete series ${cardTitle}`}
          onClick={() => {
            setDeleteTyped("");
            setDeleteError(null);
            setDeleteResult(null);
            setDeleteOpen(true);
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete series
        </Button>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename series card</DialogTitle>
            <DialogDescription>
              Changes the label on Manage Events only (e.g. add a year). Individual week titles stay
              “{title}”.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={title}
            disabled={busy}
            aria-label="Series card label"
          />
          {renameError ? <p className="text-sm text-destructive">{renameError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={busy || !renameValue.trim()}
              onClick={() => void saveRename()}
            >
              {busy ? "Saving…" : "Save label"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => (next ? setDeleteOpen(true) : closeDeleteSeries())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this series?</DialogTitle>
            <DialogDescription className="space-y-2 text-left">
              <span className="block text-foreground">
                You are deleting the series <span className="font-semibold">“{cardTitle}”</span>.
              </span>
              <span className="block">
                The series template will be removed. Unused future weeks (RSVP not open yet, with no
                RSVPs or token history) will be hard-deleted. Past weeks and weeks with RSVP open or
                closed stay on the calendar and lose their series link. This cannot be undone.
              </span>
              <span className="block">
                Type <span className="font-mono font-semibold text-foreground">DELETE</span> to
                confirm.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteTyped}
            onChange={(e) => setDeleteTyped(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={busy || Boolean(deleteResult)}
          />
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          {deleteResult ? <p className="text-sm text-foreground">{deleteResult}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={closeDeleteSeries}
            >
              {deleteResult ? "Close" : "Back"}
            </Button>
            {!deleteResult ? (
              <Button
                type="button"
                variant="destructive"
                className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                disabled={deleteTyped.trim().toUpperCase() !== "DELETE" || busy}
                onClick={() => void confirmDeleteSeries()}
              >
                {busy ? "Deleting…" : "Delete series"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
