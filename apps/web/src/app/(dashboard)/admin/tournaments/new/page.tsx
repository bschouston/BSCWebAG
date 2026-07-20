"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TrackerOption = { id: string; name: string; sport: string };

export default function NewTournamentPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "COMPLETED">("ACTIVE");
  const [statTrackerId, setStatTrackerId] = useState<string>("");
  const [trackerOptions, setTrackerOptions] = useState<TrackerOption[]>([]);
  const [loadingTrackers, setLoadingTrackers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingTrackers(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/sport-trackers", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Failed to load trackers");
        if (cancelled) return;
        const trackers = (data.trackers ?? []) as TrackerOption[];
        setTrackerOptions(trackers);
        if (trackers[0]?.id) setStatTrackerId(trackers[0].id);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load trackers");
      } finally {
        if (!cancelled) setLoadingTrackers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, status, statTrackerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to create tournament");
      }
      const data = await res.json();
      router.push(`/admin/tournaments/${data.id}/players`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Create tournament</CardTitle>
          <CardDescription>
            Choose a tracker registered in the tracker app (one per tournament).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Tournament name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Stat tracker</Label>
            <Select
              value={statTrackerId}
              onValueChange={setStatTrackerId}
              disabled={loadingTrackers || trackerOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingTrackers ? "Loading…" : "Select tracker"}
                />
              </SelectTrigger>
              <SelectContent>
                {trackerOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTrackers && trackerOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No trackers registered yet. Create one in the tracker app under All
                trackers.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            onClick={submit}
            disabled={submitting || !name.trim() || !statTrackerId}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create tournament"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
