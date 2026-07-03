"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Button, Card, CardContent } from "@bsc/ui";
import { TrackerShell } from "@/components/tracker-shell";
import { useAuth } from "@/lib/auth-context";

type MatchRow = {
  id: string;
  teamAName?: string;
  teamBName?: string;
  status: string;
};

export default function MatchPage({
  params,
}: {
  params: Promise<{ tournamentId: string; matchId: string }>;
}) {
  const { tournamentId, matchId } = use(params);
  const { user, loading } = useAuth();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [teamKey, setTeamKey] = useState<"A" | "B" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    const run = async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : { matches: [] };
      const found = (data.matches ?? []).find((m: MatchRow) => m.id === matchId) ?? null;
      setMatch(found);
    };
    void run();
  }, [loading, user, tournamentId, matchId]);

  const start = async () => {
    if (!user || !teamKey) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/locks/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tournamentId, matchId, teamKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Unable to acquire lock");
      }
      window.location.assign(
        `/tournaments/${tournamentId}/matches/${matchId}/track?team=${teamKey}`
      );
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TrackerShell>
    <main className="max-w-2xl mx-auto p-6">
      <Link
        href={`/tournaments/${tournamentId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to matches
      </Link>

      <h1 className="text-3xl font-extrabold tracking-tight mt-3">Start tracking</h1>
      <p className="text-muted-foreground mt-1 mb-6">
        Choose which team you are tracking. The team stays locked to this tablet until you finish
        and submit its stats.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {(["A", "B"] as const).map((key) => (
          <Card
            key={key}
            onClick={() => setTeamKey(key)}
            className={`cursor-pointer transition-colors ${
              teamKey === key ? "border-primary bg-primary/10" : "hover:bg-muted/40"
            }`}
          >
            <CardContent className="py-6 text-center">
              <div className="text-xs text-muted-foreground mb-1">Team {key}</div>
              <div className="font-extrabold text-lg">
                {key === "A" ? match?.teamAName ?? "Team A" : match?.teamBName ?? "Team B"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      <Button
        className="w-full h-12 text-base font-bold"
        onClick={start}
        disabled={!teamKey || busy}
      >
        {busy ? "Starting…" : "Start tracking"}
      </Button>
    </main>
    </TrackerShell>
  );
}
