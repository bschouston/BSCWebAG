"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Button, Card, CardContent } from "@bsc/ui";
import { TrackerShell } from "@/components/tracker-shell";
import { useAuth } from "@/lib/auth-context";

type MatchRow = {
  id: string;
  teamAName?: string;
  teamBName?: string;
  status: string;
};

type TeamLock = {
  teamKey: "A" | "B";
  ownerUid: string;
  ownerName: string;
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
  const [locks, setLocks] = useState<Partial<Record<"A" | "B", TeamLock>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamName = useCallback(
    (key: "A" | "B") =>
      key === "A" ? match?.teamAName?.trim() || "Home" : match?.teamBName?.trim() || "Away",
    [match]
  );

  const applyLocks = (list: TeamLock[]) => {
    const next: Partial<Record<"A" | "B", TeamLock>> = {};
    for (const lock of list) {
      if (lock.teamKey === "A" || lock.teamKey === "B") next[lock.teamKey] = lock;
    }
    setLocks(next);
  };

  const loadLocks = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}/locks`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      applyLocks((data.locks ?? []) as TeamLock[]);
    } catch {
      // Keep prior lock state
    }
  }, [user, tournamentId, matchId]);

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
      await loadLocks();
    };
    void run();
  }, [loading, user, tournamentId, matchId, loadLocks]);

  const onSelectTeam = async (key: "A" | "B") => {
    setError(null);
    if (!user) return;

    let nextLocks = locks;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}/locks`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const next: Partial<Record<"A" | "B", TeamLock>> = {};
        for (const lock of (data.locks ?? []) as TeamLock[]) {
          if (lock.teamKey === "A" || lock.teamKey === "B") next[lock.teamKey] = lock;
        }
        setLocks(next);
        nextLocks = next;
      }
    } catch {
      // Fall back to locks from page load
    }

    const existing = nextLocks[key];
    if (existing && existing.ownerUid !== user.uid) {
      setError(`${teamName(key)} is being tracked by ${existing.ownerName}`);
      return;
    }
    setTeamKey(key);
  };

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
        const holder = String(data?.lock?.ownerName ?? "").trim();
        if (data?.lock) {
          applyLocks([
            ...(Object.values(locks).filter(Boolean) as TeamLock[]).filter(
              (l) => l.teamKey !== teamKey
            ),
            {
              teamKey,
              ownerUid: String(data.lock.ownerUid ?? ""),
              ownerName: holder || "Unknown tracker",
            },
          ]);
        }
        throw new Error(
          holder
            ? `${teamName(teamKey)} is being tracked by ${holder}`
            : data?.error ?? "Unable to acquire lock"
        );
      }
      window.location.assign(
        `/tournaments/${tournamentId}/matches/${matchId}/track?team=${teamKey}`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const myUid = user?.uid;

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
          Choose which team you are tracking. The team stays locked until you finish and submit
          its stats.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(["A", "B"] as const).map((key) => {
            const lock = locks[key];
            const heldByOther = !!lock && lock.ownerUid !== myUid;
            const heldByMe = !!lock && lock.ownerUid === myUid;
            const selected = teamKey === key;
            const name = teamName(key);
            return (
              <Card
                key={key}
                onClick={() => void onSelectTeam(key)}
                className={`cursor-pointer transition-colors ${
                  heldByOther
                    ? "border-amber-500/40 bg-amber-500/5"
                    : selected
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted/40"
                }`}
              >
                <CardContent className="py-6 text-center space-y-2">
                  <div className="font-extrabold text-lg">{name}</div>
                  {heldByMe ? (
                    <div className="text-xs font-semibold text-primary">Locked by you</div>
                  ) : heldByOther ? (
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Tracking: {lock.ownerName}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Available</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

        <Button
          className="w-full h-12 text-base font-bold"
          onClick={start}
          disabled={
            !teamKey ||
            busy ||
            (!!teamKey && !!locks[teamKey] && locks[teamKey]!.ownerUid !== myUid)
          }
        >
          {busy ? "Starting…" : "Start tracking"}
        </Button>
      </main>
    </TrackerShell>
  );
}
