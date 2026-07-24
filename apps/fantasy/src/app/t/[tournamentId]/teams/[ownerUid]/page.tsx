"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFantasyTeamValue } from "@bsc/shared";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { PlayerStatTable } from "@/components/player-stat-table";
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

export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ tournamentId: string; ownerUid: string }>;
}) {
  const { tournamentId, ownerUid } = use(params);
  const { user, loading } = useAuth();
  const { tournamentName, config, statsById, livePlayers, leaderboardColumns, pointsColor } =
    useLiveTournamentStats(tournamentId);
  const [allTeams, setAllTeams] = useState<FantasyTeamRow[]>([]);
  const [busy, setBusy] = useState(true);

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
      setAllTeams((data.teams ?? []) as FantasyTeamRow[]);
      setBusy(false);
    };
    void run();
  }, [user, loading, tournamentId]);

  const team = useMemo(
    () => allTeams.find((t) => t.id === ownerUid) ?? null,
    [allTeams, ownerUid]
  );

  const roster = useMemo(() => {
    const ids = new Set(team?.playerIds ?? []);
    return livePlayers.filter((p) => ids.has(p.id));
  }, [livePlayers, team]);

  const totalValue = useMemo(
    () => (config ? computeFantasyTeamValue(team?.playerIds ?? [], statsById, config) : 0),
    [config, team, statsById]
  );

  // Rank follows live values without refetching the team list.
  const rank = useMemo(() => {
    if (!config || !team) return null;
    const ordered = allTeams
      .map((t) => ({
        id: t.id,
        value: computeFantasyTeamValue(t.playerIds ?? [], statsById, config),
      }))
      .sort((a, b) => b.value - a.value);
    const index = ordered.findIndex((t) => t.id === ownerUid);
    return index >= 0 ? index + 1 : null;
  }, [allTeams, config, statsById, ownerUid, team]);

  if (loading || !user) return null;

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/t/${tournamentId}/teams`}>← All teams</Link>
          </Button>
          <p className="text-sm font-semibold text-muted-foreground">{tournamentName}</p>
        </div>

        {busy ? (
          <p className="text-muted-foreground">Loading team…</p>
        ) : !team ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              This team no longer exists.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bsc-accent-card">
              <CardContent className="py-6 flex flex-wrap items-center gap-6">
                {team.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.photoUrl}
                    alt=""
                    className="h-20 w-20 rounded-xl object-cover border"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-extrabold text-primary">
                    {(team.teamName ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-3xl font-extrabold tracking-tight text-foreground truncate">
                    {team.teamName ?? "Untitled team"}
                  </h1>
                  <p className="text-muted-foreground">
                    Manager: {team.ownerDisplayName ?? "Manager"}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-sm font-semibold text-muted-foreground">
                    Live Fantasy Pts
                  </div>
                  <div className="text-4xl font-extrabold tabular-nums text-foreground">
                    {totalValue.toFixed(1)}
                  </div>
                  {rank ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Rank {rank} of {allTeams.length}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="bsc-accent-card">
              <CardHeader>
                <CardTitle>Roster stats</CardTitle>
                <CardDescription>
                  {team.isMine
                    ? "Your roster, with the same stat breakdown as the leaderboard."
                    : "Read-only view of this manager's roster."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerStatTable
                  players={roster}
                  columns={leaderboardColumns}
                  pointsColor={pointsColor}
                  emptyMessage="This team has no players yet."
                />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </FantasyShell>
  );
}
