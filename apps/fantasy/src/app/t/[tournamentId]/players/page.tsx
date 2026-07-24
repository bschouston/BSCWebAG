"use client";

import { use, useEffect } from "react";
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

  useEffect(() => {
    if (!loading && !user) window.location.assign("/login");
  }, [loading, user]);

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
              searchable
              emptyMessage="No player stats yet."
            />
          </CardContent>
        </Card>
      </main>
    </FantasyShell>
  );
}
