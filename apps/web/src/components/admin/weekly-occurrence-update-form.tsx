"use client";

import { useMemo, useState } from "react";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { chicagoDatetimeLocal, chicagoWallToUtc, resolveWeeklyEndUtc } from "@/lib/chicago-time";
import { chicagoTimeLabel, weeklyOccurrenceStarted } from "@/lib/weekly-rsvp";
import { useAuth } from "@/lib/auth-context";

function timePart(iso: string) {
  const t = iso.includes("T") ? iso.split("T")[1] : iso;
  return t.slice(0, 5);
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function WeeklyOccurrenceUpdateForm({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const started = weeklyOccurrenceStarted(event);
  const startIso = event.startTime as unknown as string;
  const endIso = event.endTime as unknown as string;
  const startLocal = useMemo(() => chicagoDatetimeLocal(new Date(startIso)), [startIso]);
  const endLocal = useMemo(() => chicagoDatetimeLocal(new Date(endIso)), [endIso]);

  const [startTime, setStartTime] = useState(timePart(startLocal));
  const [endTime, setEndTime] = useState(timePart(endLocal));
  const [locationId, setLocationId] = useState(event.locationId || "");
  const [capacity, setCapacity] = useState(String(event.capacity ?? ""));
  const [minCapacity, setMinCapacity] = useState(String(event.minCapacity ?? 1));
  const [tokensMax, setTokensMax] = useState(String(event.tokensMax ?? event.tokensRequired ?? 0));
  const [tokensMin, setTokensMin] = useState(String(event.tokensMin ?? event.tokensMax ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const resolvedEndLabel = useMemo(() => {
    if (!startTime || !endTime) return "";
    const nextStart = chicagoWallToUtc(`${startLocal.slice(0, 10)}T${startTime}`);
    return chicagoTimeLabel(resolveWeeklyEndUtc(nextStart, endTime));
  }, [startLocal, startTime, endTime]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_occurrence",
          startTimeLocal: startTime,
          endTimeLocal: endTime,
          locationId,
          capacity: Number(capacity),
          minCapacity: Number(minCapacity),
          tokensMax: Number(tokensMax),
          tokensMin: Number(tokensMin),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      const eventRes = await fetch(`/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fresh = await eventRes.json().catch(() => null);
      if (fresh?.id) onEventChange(fresh);
      const n = (data.changes || []).length;
      setOk(
        n
          ? `Saved ${n} change${n === 1 ? "" : "s"}${data.emailsSent ? ` · emailed ${data.emailsSent} member${data.emailsSent === 1 ? "" : "s"}` : ""}${data.pendingAuth ? ` · ${data.pendingAuth} must authorize extra tokens` : ""}`
          : "No changes"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-[#1a3556] dark:text-foreground">Change this week</CardTitle>
        <CardDescription>
          After RSVP opens, title and date stay locked. You can change time, location, capacity, and
          tokens until the event starts. One save sends one summary email when members need to know.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {started ? (
          <p className="text-sm text-muted-foreground">This event has started. These fields are locked.</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Date (locked)</Label>
            <p className="mt-2 text-sm font-medium text-[#1a3556] dark:text-foreground">{dateLabel(startIso)}</p>
          </div>
          <div>
            <Label htmlFor="occ-location">Location</Label>
            <Input
              id="occ-location"
              className="mt-2"
              value={locationId}
              disabled={started || busy}
              onChange={(e) => setLocationId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="occ-start">Start time (America/Chicago)</Label>
            <Input
              id="occ-start"
              type="time"
              className="mt-2"
              value={startTime}
              disabled={started || busy}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="occ-end">End time (America/Chicago)</Label>
            <Input
              id="occ-end"
              type="time"
              className="mt-2"
              value={endTime}
              disabled={started || busy}
              onChange={(e) => setEndTime(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              If this clock time is 12:00 AM or otherwise not after start on the same day, it is saved
              as the next morning (America/Chicago).
            </p>
            {resolvedEndLabel ? (
              <p className="mt-1 text-sm font-medium text-[#1a3556] dark:text-foreground">
                Ends {resolvedEndLabel}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="occ-cap">Capacity</Label>
            <Input
              id="occ-cap"
              type="number"
              min={1}
              className="mt-2"
              value={capacity}
              disabled={started || busy}
              onChange={(e) => setCapacity(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Cannot go below {event.confirmedCount || 0} already confirmed.
            </p>
          </div>
          <div>
            <Label htmlFor="occ-mincap">Min capacity</Label>
            <Input
              id="occ-mincap"
              type="number"
              min={1}
              className="mt-2"
              value={minCapacity}
              disabled={started || busy}
              onChange={(e) => setMinCapacity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="occ-tmax">Token hold (max)</Label>
            <Input
              id="occ-tmax"
              type="number"
              min={0}
              className="mt-2"
              value={tokensMax}
              disabled={started || busy}
              onChange={(e) => setTokensMax(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Increasing this emails RSVP’d members. They must authorize the extra hold.
            </p>
          </div>
          <div>
            <Label htmlFor="occ-tmin">Token minimum (as low as)</Label>
            <Input
              id="occ-tmin"
              type="number"
              min={0}
              className="mt-2"
              value={tokensMin}
              disabled={started || busy}
              onChange={(e) => setTokensMin(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? <p className="text-sm text-[#1a3556] dark:text-[#ffd700]">{ok}</p> : null}
        <Button
          type="button"
          className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
          disabled={started || busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
