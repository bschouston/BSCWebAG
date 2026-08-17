"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeTokensFinal } from "@/lib/weekly-tokens";

type RsvpRow = {
  id: string;
  status?: string;
  noShow?: boolean;
  user?: { firstName?: string; lastName?: string; email?: string } | null;
};

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
      if (body.action === "cancel_event") {
        onEventChange({ status: "CANCELLED", confirmedCount: 0, waitlistCount: 0 });
      }
      if (body.action === "no_show") {
        setRsvps((prev) => prev.map((r) => (r.id === body.targetRsvpId ? { ...r, noShow: true } : r)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>This week’s occurrence</CardTitle>
        <CardDescription>
          Confirmed {confirmed}
          {event.minCapacity ? ` · min ${event.minCapacity}` : ""}
          {event.waitlistCount ? ` · waitlist ${event.waitlistCount}` : ""}. Preview settle{" "}
          {preview} tokens (held at {event.tokensMax ?? event.tokensRequired ?? 0}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={done || !!busy}
            onClick={() => {
              if (!confirm(`Finalize this occurrence at ${preview} tokens per confirmed RSVP?`)) return;
              void run({ action: "finalize", confirmedCount: confirmed }, "finalize");
            }}
          >
            {busy === "finalize" ? "Finalizing…" : "Finalize tokens"}
          </Button>
          <Button
            variant="destructive"
            disabled={done || !!busy}
            onClick={() => {
              if (!confirm("Cancel this occurrence and refund all active RSVPs?")) return;
              void run({ action: "cancel_event" }, "cancel");
            }}
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel occurrence"}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">No-show</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="noshow-rsvp">Member</Label>
              <select
                id="noshow-rsvp"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={targetRsvpId}
                onChange={(e) => setTargetRsvpId(e.target.value)}
              >
                <option value="">Select RSVP</option>
                {rsvps.map((r) => {
                  const name = [r.user?.firstName, r.user?.lastName].filter(Boolean).join(" ") || r.user?.email || r.id;
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
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
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
            {busy === "noshow" ? "Saving…" : "Mark no-show"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
