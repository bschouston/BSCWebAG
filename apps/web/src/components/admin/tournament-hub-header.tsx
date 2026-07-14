"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TournamentMeta = {
  id: string;
  name: string;
  status: string;
  eventId?: string | null;
};

export function TournamentHubHeader({ tournamentId }: { tournamentId: string }) {
  const { user } = useAuth();
  const [tournament, setTournament] = useState<TournamentMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch(`/api/tournaments/${tournamentId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok && data.tournament) {
          setTournament({
            id: data.tournament.id,
            name: data.tournament.name,
            status: data.tournament.status,
            eventId: data.tournament.eventId ?? null,
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tournamentId, user]);

  const setStatus = async (status: "ACTIVE" | "ARCHIVED") => {
    setBusy(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update status");
      setTournament((prev) => (prev ? { ...prev, status } : prev));
      window.dispatchEvent(new CustomEvent("bsc:tournaments-changed"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {tournament?.name ?? "Tournament"}
          </h1>
          {tournament?.status ? (
            <Badge
              variant={
                tournament.status === "ACTIVE"
                  ? "default"
                  : tournament.status === "ARCHIVED"
                    ? "outline"
                    : "secondary"
              }
            >
              {tournament.status}
            </Badge>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive mt-1">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/trackers">Tracker Logins</Link>
        </Button>
        {tournament?.status === "ARCHIVED" ? (
          <Button size="sm" disabled={busy} onClick={() => void setStatus("ACTIVE")}>
            {busy ? "Updating…" : "Unarchive / Publish"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !tournament}
            onClick={() => void setStatus("ARCHIVED")}
          >
            {busy ? "Updating…" : "Archive"}
          </Button>
        )}
      </div>
    </div>
  );
}
