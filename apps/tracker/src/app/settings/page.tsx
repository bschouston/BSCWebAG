"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  buildStatTrackerId,
  normalizeSportSlug,
  type SportTrackerRegistryEntry,
} from "@bsc/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bsc/ui";
import { TrackerShell } from "@/components/tracker-shell";
import { profileCanManageTrackerSports, useAuth } from "@/lib/auth-context";

type ContainerTypeOption = {
  containerType: string;
  name: string;
  matchFormat: string;
  defaultSport: string;
  defaultId: string;
  periodLabel: string;
};

/**
 * Sport tracker registry — create trackers from shipped container modules,
 * then configure stats/scoring on each sport's settings page.
 */
export default function SportsSettingsIndexPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const canManage = profileCanManageTrackerSports(profile);
  const [trackers, setTrackers] = useState<SportTrackerRegistryEntry[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [containerType, setContainerType] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/sport-trackers", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load trackers");
      setTrackers(data.trackers ?? []);
      setContainerTypes(data.containerTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trackers");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (authLoading) return;
    if (!canManage) {
      router.replace("/");
      return;
    }
    void load();
  }, [authLoading, canManage, load, router]);

  const selectedType = useMemo(
    () => containerTypes.find((c) => c.containerType === containerType) ?? null,
    [containerTypes, containerType]
  );

  const previewId = useMemo(() => {
    const slug = normalizeSportSlug(sport || selectedType?.defaultSport || "");
    return slug ? buildStatTrackerId(slug) : "";
  }, [sport, selectedType]);

  const openCreate = () => {
    const first = containerTypes[0];
    setContainerType(first?.containerType ?? "");
    setName(first?.name ?? "");
    setSport(first?.defaultSport ?? "");
    setFormError(null);
    setOpen(true);
  };

  const onTypeChange = (value: string) => {
    setContainerType(value);
    const type = containerTypes.find((c) => c.containerType === value);
    if (type) {
      setName(type.name);
      setSport(type.defaultSport);
    }
  };

  const create = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/sport-trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          containerType,
          name,
          sport: sport || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to create tracker");
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create tracker");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !canManage) {
    return (
      <TrackerShell>
        <main className="max-w-3xl mx-auto p-6 text-muted-foreground">Loading…</main>
      </TrackerShell>
    );
  }

  return (
    <TrackerShell>
      <div className="p-4 md:p-6 space-y-6 max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Sport trackers</h1>
            <p className="text-muted-foreground mt-1">
              Create a tracker from a sport container, then configure stats and
              scoring. Admin attaches one tracker per tournament; recorded stats
              stay inside that tournament.
            </p>
          </div>
          <Button onClick={openCreate} disabled={loading || containerTypes.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add tracker
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : trackers.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              No trackers yet. Click <strong>Add tracker</strong> to create one from
              a container type (Volleyball is available now).
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {trackers.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <CardDescription>
                    {t.id} · container: {t.containerType} · sport: {t.sport}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/settings/${t.sport}`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Open settings
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {containerTypes.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No container modules are shipped in this build yet.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tracker</DialogTitle>
            <DialogDescription>
              Pick a sport container module. That chooses scoring mechanics; you
              can still customize the display name and sport slug.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Container type</Label>
              <Select value={containerType} onValueChange={onTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select container" />
                </SelectTrigger>
                <SelectContent>
                  {containerTypes.map((c) => (
                    <SelectItem key={c.containerType} value={c.containerType}>
                      {c.name} ({c.matchFormat})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tracker-name">Display name</Label>
              <Input
                id="tracker-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Volleyball"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="tracker-sport">Sport slug</Label>
              <Input
                id="tracker-sport"
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                placeholder="volleyball"
              />
              <p className="text-xs text-muted-foreground">
                Used in settings URL and config doc. Tracker id will be{" "}
                <span className="font-mono">{previewId || "—"}</span>
              </p>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void create()}
              disabled={submitting || !containerType || !name.trim()}
            >
              {submitting ? "Creating…" : "Create tracker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TrackerShell>
  );
}
