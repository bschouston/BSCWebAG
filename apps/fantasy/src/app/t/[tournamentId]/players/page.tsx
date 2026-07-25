"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { PlayerStatTable } from "@/components/player-stat-table";
import { useAuth } from "@/lib/auth-context";
import { useLiveTournamentStats } from "@/lib/use-live-tournament-stats";

export default function PlayersPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, loading } = useAuth();
  const { tournamentName, livePlayers, config, leaderboardColumns, pointsColor } =
    useLiveTournamentStats(tournamentId);
  const [playerValues, setPlayerValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!loading && !user) window.location.assign("/login");
  }, [loading, user]);

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setPlayerValues(
        data.config?.playerValues && typeof data.config.playerValues === "object"
          ? (data.config.playerValues as Record<string, number>)
          : {}
      );
    };
    void run();
  }, [user, tournamentId]);

  if (loading || !user) return null;

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-muted-foreground">{tournamentName}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Player stats</h1>
          <p className="text-muted-foreground mt-1">
            Live values from tracker settings
            {config ? ` (${config.stats.filter((s) => s.enabled !== false).length} stats)` : ""}.
          </p>
        </div>

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Leaderboard-style values</CardTitle>
            <CardDescription>Updates automatically as plays are recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerStatTable
              players={livePlayers}
              columns={leaderboardColumns}
              pointsColor={pointsColor}
              playerValues={playerValues}
              searchable
              emptyMessage="No player stats yet."
            />
          </CardContent>
        </Card>
      </main>
    </FantasyShell>
  );
}
