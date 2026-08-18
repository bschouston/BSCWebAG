"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { effectiveRsvpWindowState, weeklyRsvpWindow } from "@/lib/rsvp-window";

type RsvpRow = {
  id: string;
  status?: string;
  noShow?: boolean;
  user?: { firstName?: string; lastName?: string; email?: string } | null;
};

function formatWhen(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function rsvpOverrideButtonClass(active: boolean) {
  return active
    ? "h-11 bg-[#1a3556] px-5 text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
    : "h-11 px-5 disabled:bg-muted disabled:text-foreground disabled:opacity-100";
}

export function WeeklyRsvpWindowCard({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = event.status === "COMPLETED" || event.status === "CANCELLED";
  const scheduledState = effectiveRsvpWindowState({
    opensAt: event.rsvpOpensAt,
    closesAt: event.rsvpClosesAt,
    override: null,
  });
  const effectiveState = weeklyRsvpWindow(event);
  const override = event.rsvpManualOverride ?? null;
  const rsvpsOpen = effectiveState === "open";

  const setOverride = async (rsvpManualOverride: "open" | "closed" | null) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "set_rsvp_override", rsvpManualOverride }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      onEventChange({
        rsvpManualOverride: (data.rsvpManualOverride ?? null) as SportEvent["rsvpManualOverride"],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const scheduledNote =
    scheduledState === "before"
      ? "not open yet by schedule"
      : scheduledState === "closed"
        ? "closed by schedule"
        : "inside the scheduled window";
  const overrideNote =
    override === "open"
      ? "Manually opened — members can RSVP regardless of the schedule."
      : override === "closed"
        ? "Manually closed — members cannot RSVP until you reopen or return to the schedule."
        : "Following the scheduled window.";

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-[#1a3556] dark:text-foreground">
          {rsvpsOpen ? "RSVPs are open" : "RSVPs are closed"}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Scheduled window: {formatWhen(event.rsvpOpensAt)} – {formatWhen(event.rsvpClosesAt)} ({scheduledNote}).{" "}
          {overrideNote}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={rsvpsOpen ? "default" : "outline"}
            className={rsvpOverrideButtonClass(rsvpsOpen)}
            disabled={done || busy}
            onClick={() => void setOverride(scheduledState === "open" ? null : "open")}
          >
            {busy && !rsvpsOpen ? "Opening…" : "Open RSVPs now"}
          </Button>
          <Button
            type="button"
            variant={!rsvpsOpen ? "default" : "outline"}
            className={rsvpOverrideButtonClass(!rsvpsOpen)}
            disabled={done || busy}
            onClick={() => void setOverride(scheduledState === "closed" ? null : "closed")}
          >
            {busy && rsvpsOpen ? "Closing…" : "Close RSVPs now"}
          </Button>
          {override ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 px-5 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={done || busy}
              onClick={() => void setOverride(null)}
            >
              {busy ? "Updating…" : "Return to scheduled window"}
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function WeeklyCancelEventButton({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTyped, setCancelTyped] = useState("");
  const done = event.status === "COMPLETED" || event.status === "CANCELLED";

  const close = () => {
    setOpen(false);
    setCancelTyped("");
    setError(null);
  };

  const cancelEvent = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cancel_event" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      onEventChange({ status: "CANCELLED", confirmedCount: 0, waitlistCount: 0 });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
        disabled={done || busy}
        onClick={() => setOpen(true)}
      >
        {busy ? "Cancelling…" : "Cancel event"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
            <DialogDescription>
              All confirmed and waitlisted RSVPs will be cancelled and token holds refunded. Type{" "}
              <span className="font-mono font-semibold text-foreground">CANCEL</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={cancelTyped}
            onChange={(e) => setCancelTyped(e.target.value)}
            placeholder="CANCEL"
            autoComplete="off"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Back
            </Button>
            <Button
              variant="destructive"
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={cancelTyped.trim().toUpperCase() !== "CANCEL" || busy}
              onClick={() => void cancelEvent()}
            >
              {busy ? "Cancelling…" : "Cancel event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function WeeklyOccurrenceActions({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [targetRsvpId, setTargetRsvpId] = useState("");
  const [noShowMode, setNoShowMode] = useState<"keep_hold" | "refund_attended" | "custom_debit">("keep_hold");
  const [extraTokens, setExtraTokens] = useState(0);
  const [dialog, setDialog] = useState<null | "finalize" | "noshow">(null);
  const [ackFinalize, setAckFinalize] = useState(false);

  const done = event.status === "COMPLETED" || event.status === "CANCELLED";
  const confirmed = Number(event.confirmedCount) || 0;
  const preview =
    event.settlePreviewTokens ??
    computeTokensFinal({
      confirmedCount: confirmed,
      minCapacity: Number(event.minCapacity) || 1,
      maxCapacity: Number(event.capacity) || 1,
      tokensMin: Number(event.tokensMin) || 0,
      tokensMax: Number(event.tokensMax) || 0,
    });

  useEffect(() => {
    async function load() {
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/rsvps?eventId=${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      const rows = (data.rsvps || []) as RsvpRow[];
      setRsvps(rows.filter((r) => r.status === "CONFIRMED" || r.status === "WAITLISTED"));
    }
    void load();
  }, [eventId, user]);

  const closeDialog = () => {
    setDialog(null);
    setAckFinalize(false);
  };

  const run = async (body: Record<string, unknown>, key: string) => {
    if (!user) return;
    setBusy(key);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (body.action === "finalize") {
        onEventChange({ status: "COMPLETED", tokensFinal: data.tokensFinal });
      }
      if (body.action === "no_show") {
        setRsvps((prev) => prev.map((r) => (r.id === body.targetRsvpId ? { ...r, noShow: true } : r)));
      }
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const selectedRsvp = rsvps.find((r) => r.id === targetRsvpId);
  const selectedName =
    [selectedRsvp?.user?.firstName, selectedRsvp?.user?.lastName].filter(Boolean).join(" ") ||
    selectedRsvp?.user?.email ||
    "this member";
  const noShowLabel =
    noShowMode === "keep_hold"
      ? "keep the full token hold"
      : noShowMode === "refund_attended"
        ? "refund as if they attended"
        : `keep the hold and debit ${extraTokens} extra token${extraTokens === 1 ? "" : "s"}`;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-[#1a3556] dark:text-foreground">This week’s occurrence</CardTitle>
        <CardDescription>
          Confirmed {confirmed}
          {event.minCapacity ? ` · min ${event.minCapacity}` : ""}
          {event.waitlistCount ? ` · waitlist ${event.waitlistCount}` : ""}. Preview settle {preview} tokens
          (held at {event.tokensMax ?? event.tokensRequired ?? 0}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={done || !!busy}
            onClick={() => setDialog("finalize")}
          >
            {busy === "finalize" ? "Finalizing…" : "Finalize tokens"}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold text-foreground">No-show</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="noshow-rsvp">Member</Label>
              <select
                id="noshow-rsvp"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                value={targetRsvpId}
                onChange={(e) => setTargetRsvpId(e.target.value)}
              >
                <option value="">Select RSVP</option>
                {rsvps.map((r) => {
                  const name =
                    [r.user?.firstName, r.user?.lastName].filter(Boolean).join(" ") || r.user?.email || r.id;
                  return (
                    <option key={r.id} value={r.id}>
                      {name}
                      {r.status === "WAITLISTED" ? " (waitlist)" : ""}
                      {r.noShow ? " — marked" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="noshow-mode">Action</Label>
              <select
                id="noshow-mode"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                value={noShowMode}
                onChange={(e) => setNoShowMode(e.target.value as typeof noShowMode)}
              >
                <option value="keep_hold">Keep full hold</option>
                <option value="refund_attended">Refund as attended</option>
                <option value="custom_debit">Keep hold + extra debit</option>
              </select>
            </div>
            {noShowMode === "custom_debit" ? (
              <div className="space-y-1">
                <Label htmlFor="noshow-extra">Extra tokens</Label>
                <Input
                  id="noshow-extra"
                  type="number"
                  min={0}
                  value={extraTokens}
                  onChange={(e) => setExtraTokens(Number(e.target.value) || 0)}
                />
              </div>
            ) : null}
          </div>
          <Button
            variant="outline"
            disabled={done || !!busy || !targetRsvpId}
            onClick={() => setDialog("noshow")}
          >
            {busy === "noshow" ? "Saving…" : "Mark no-show"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <Dialog open={dialog === "finalize"} onOpenChange={(open) => (open ? setDialog("finalize") : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize tokens?</DialogTitle>
            <DialogDescription>
              This settles the occurrence and cannot be undone. {confirmed} confirmed RSVP
              {confirmed === 1 ? "" : "s"} will be charged {preview} tokens each (held at{" "}
              {event.tokensMax ?? event.tokensRequired ?? 0}). Unused hold amounts are refunded.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={ackFinalize}
              onCheckedChange={(v) => setAckFinalize(v === true)}
              className="mt-0.5"
            />
            I understand this finalizes token charges for this occurrence.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={!ackFinalize || !!busy}
              onClick={() => void run({ action: "finalize", confirmedCount: confirmed }, "finalize")}
            >
              {busy === "finalize" ? "Finalizing…" : "Confirm finalize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "noshow"} onOpenChange={(open) => (open ? setDialog("noshow") : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark no-show?</DialogTitle>
            <DialogDescription>
              Mark {selectedName} as a no-show and {noShowLabel}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Back
            </Button>
            <Button
              disabled={!!busy || !targetRsvpId}
              onClick={() =>
                void run(
                  {
                    action: "no_show",
                    targetRsvpId,
                    noShowMode,
                    extraTokens: noShowMode === "custom_debit" ? extraTokens : 0,
                  },
                  "noshow"
                )
              }
            >
              {busy === "noshow" ? "Saving…" : "Confirm no-show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
