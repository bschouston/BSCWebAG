"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFantasyTeamValue } from "@bsc/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { useAuth } from "@/lib/auth-context";
import { useLiveTournamentStats } from "@/lib/use-live-tournament-stats";

type FantasyTeamRow = {
  id: string;
  teamName?: string;
  ownerDisplayName?: string;
  photoUrl?: string | null;
  playerIds?: string[];
  isMine?: boolean;
  effectivelyLocked?: boolean;
};

export default function AllTeamsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, loading } = useAuth();
  const { tournamentName, config, statsById } = useLiveTournamentStats(tournamentId);
  const [teams, setTeams] = useState<FantasyTeamRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    const run = async () => {
      setBusy(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setTeams(data.teams ?? []);
      setBusy(false);
    };
    void run();
  }, [user, loading, tournamentId]);

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withValue = teams.map((t) => ({
      ...t,
      value: config ? computeFantasyTeamValue(t.playerIds ?? [], statsById, config) : 0,
    }));
    const filtered = q
      ? withValue.filter(
          (t) =>
            String(t.teamName ?? "").toLowerCase().includes(q) ||
            String(t.ownerDisplayName ?? "").toLowerCase().includes(q)
        )
      : withValue;
    return filtered.sort(
      (a, b) =>
        b.value - a.value ||
        String(a.teamName ?? "").localeCompare(String(b.teamName ?? ""))
    );
  }, [teams, config, statsById, query]);

  if (loading || !user) return null;

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-muted-foreground">{tournamentName}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">All teams</h1>
          <p className="text-muted-foreground mt-1">
            Browse everyone&apos;s rosters and live values. Tap a team to see its player stats.
          </p>
        </div>

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>
              {busy ? "Loading…" : `${teams.length} team${teams.length === 1 ? "" : "s"}`}
            </CardTitle>
            <CardDescription>Ranked by live Fantasy Pts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team or manager…"
              className="max-w-xs h-10"
              aria-label="Search teams"
            />
            {ranked.length === 0 && !busy ? (
              <p className="text-sm text-muted-foreground">No teams have been created yet.</p>
            ) : (
              <div className="space-y-2">
                {ranked.map((t, i) => (
                  <Link key={t.id} href={`/t/${tournamentId}/teams/${t.id}`}>
                    <div className="flex items-center gap-3 rounded-xl border px-3 py-3 hover:border-bsc-red/40 hover:bg-bsc-red/5 transition-colors">
                      <span className="w-6 text-center font-bold tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      {t.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.photoUrl}
                          alt=""
                          className="h-11 w-11 rounded-lg object-cover border"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-lg bg-bsc-red/10 flex items-center justify-center font-extrabold text-bsc-red">
                          {(t.teamName ?? "?").slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">
                          {t.teamName ?? "Untitled team"}
                          {t.isMine ? (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide rounded-full bg-primary text-primary-foreground px-2 py-0.5">
                              You
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.ownerDisplayName ?? "Manager"} · {(t.playerIds ?? []).length} players
                          {t.effectivelyLocked ? " · Locked" : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-extrabold tabular-nums text-foreground">
                          {t.value.toFixed(1)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Fantasy Pts
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </FantasyShell>
  );
}
