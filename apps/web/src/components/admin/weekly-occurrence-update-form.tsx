"use client";

import { useMemo, useState } from "react";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
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

  const confirmedFloor = Math.max(1, Number(event.confirmedCount) || 0);
  const [startTime, setStartTime] = useState(timePart(startLocal));
  const [endTime, setEndTime] = useState(timePart(endLocal));
  const [locationId, setLocationId] = useState(event.locationId || "");
  const initialCapacity = Math.max(confirmedFloor, Number(event.capacity) || confirmedFloor);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [minCapacity, setMinCapacity] = useState(
    Math.min(initialCapacity, Math.max(1, Number(event.minCapacity) || 1))
  );
  const [tokensMax, setTokensMax] = useState(
    Math.max(0, Number(event.tokensMax ?? event.tokensRequired) || 0)
  );
  const [tokensMin, setTokensMin] = useState(
    Math.max(0, Number(event.tokensMin ?? event.tokensMax ?? event.tokensRequired) || 0)
  );
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
          capacity,
          minCapacity,
          tokensMax,
          tokensMin,
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

  const locked = started || busy;

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
              disabled={locked}
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
              disabled={locked}
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
              disabled={locked}
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
          <NumberStepper
            id="occ-cap"
            label="Capacity"
            value={capacity}
            min={confirmedFloor}
            disabled={locked}
            onChange={(next) => {
              setCapacity(next);
              if (minCapacity > next) setMinCapacity(next);
            }}
            decreaseLabel="Decrease capacity"
            increaseLabel="Increase capacity"
            hint={`Cannot go below ${event.confirmedCount || 0} already confirmed.`}
          />
          <NumberStepper
            id="occ-mincap"
            label="Min capacity"
            value={minCapacity}
            min={1}
            max={capacity}
            disabled={locked}
            onChange={setMinCapacity}
            decreaseLabel="Decrease min capacity"
            increaseLabel="Increase min capacity"
          />
          <NumberStepper
            id="occ-tmax"
            label="Token hold (max)"
            value={tokensMax}
            min={0}
            disabled={locked}
            onChange={(next) => {
              setTokensMax(next);
              if (tokensMin > next) setTokensMin(next);
            }}
            decreaseLabel="Decrease token hold max"
            increaseLabel="Increase token hold max"
            hint="Increasing this emails RSVP’d members. They must authorize the extra hold."
          />
          <NumberStepper
            id="occ-tmin"
            label="Token minimum (as low as)"
            value={tokensMin}
            min={0}
            max={tokensMax}
            disabled={locked}
            onChange={setTokensMin}
            decreaseLabel="Decrease token minimum"
            increaseLabel="Increase token minimum"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {ok ? <p className="text-sm text-[#1a3556] dark:text-[#ffd700]">{ok}</p> : null}
        <Button
          type="button"
          className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
          disabled={locked}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
