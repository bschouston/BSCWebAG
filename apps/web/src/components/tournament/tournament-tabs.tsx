"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  VOLLEYBALL_STAT_KEYS,
  computeLeaderboardValue,
  defaultVolleyballTrackerConfig,
  getStatTracker,
  trackerConfigLeaderboardColumns,
  type TrackerStat,
} from "@bsc/shared";
import { db } from "@/lib/firebase/client";
import { LiveIframe } from "@/components/live/live-iframe";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PUBLIC_TOURNAMENT_TAB_LABELS,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";

type MatchDoc = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  winnerTeamId?: string | null;
  scheduledAt?: { seconds?: number } | null;
};

type TeamDoc = { id: string; name: string; color?: string | null };

type TeamStatsDoc = {
  id: string;
  wins?: number;
  losses?: number;
  setsWon?: number;
  setsLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
};

type PlayerStatsDoc = {
  id: string;
  displayName?: string | null;
  teamId?: string | null;
  [counter: string]: unknown;
};

function sportFromTrackerId(statTrackerId: string): string {
  try {
    return getStatTracker(statTrackerId).sport;
  } catch {
    return statTrackerId.split(".")[0] || "volleyball";
  }
}

export function TournamentTabs({
  tournamentId,
  enabledTabs,
  sheetSrc,
  pageTitle,
}: {
  tournamentId: string;
  enabledTabs: PublicTournamentTabId[];
  sheetSrc?: string;
  pageTitle: string;
}) {
  const [activeTab, setActiveTab] = useState<string>(enabledTabs[0] ?? "schedule");
  const [matches, setMatches] = useState<MatchDoc[] | null>(null);
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsDoc[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatsDoc[]>([]);
  const [leaderboardColumns, setLeaderboardColumns] = useState<
    { field: string; label: string }[]
  >(
    VOLLEYBALL_STAT_KEYS.map((s) => ({ field: s.aggregateField, label: s.shortLabel }))
  );
  const [configStats, setConfigStats] = useState<TrackerStat[]>(
    defaultVolleyballTrackerConfig().stats
  );
  const [sport, setSport] = useState<string>("volleyball");

  useEffect(() => {
    if (!enabledTabs.includes(activeTab as PublicTournamentTabId)) {
      setActiveTab(enabledTabs[0] ?? "schedule");
    }
  }, [enabledTabs, activeTab]);

  // Leaderboard columns + Value weights come from the global tracker config.
  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, "trackerConfigs", sport), (snap) => {
      const data = snap.data() as any;
      if (!data?.stats || !Array.isArray(data.stats)) return;
      setConfigStats(data.stats as TrackerStat[]);
      setLeaderboardColumns(trackerConfigLeaderboardColumns(data));
    });
  }, [sport]);

  useEffect(() => {
    if (!db) return;
    const tournamentRef = doc(db, "tournaments", tournamentId);
    const unsubs = [
      onSnapshot(tournamentRef, (snap) => {
        const id = (snap.data() as any)?.statTrackerId;
        if (id) setSport(sportFromTrackerId(String(id)));
      }),
      onSnapshot(
        query(collection(tournamentRef, "matches"), orderBy("scheduledAt", "asc")),
        (snap) =>
          setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchDoc[])
      ),
      onSnapshot(collection(tournamentRef, "teams"), (snap) =>
        setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeamDoc[])
      ),
      onSnapshot(collection(tournamentRef, "teamStats"), (snap) =>
        setTeamStats(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeamStatsDoc[]
        )
      ),
      onSnapshot(collection(tournamentRef, "playerStats"), (snap) =>
        setPlayerStats(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlayerStatsDoc[]
        )
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [tournamentId]);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.name]));
    return (id?: string | null) => (id ? map.get(id) ?? "Team" : "Team");
  }, [teams]);

  const liveMatches = (matches ?? []).filter((m) => m.status === "IN_PROGRESS");
  const upcoming = (matches ?? []).filter((m) => m.status === "UPCOMING");
  const completed = (matches ?? []).filter((m) => m.status === "COMPLETED");

  const standings = useMemo(() => {
    return teams
      .map((t) => {
        const s = teamStats.find((x) => x.id === t.id);
        return {
          teamId: t.id,
          name: t.name,
          wins: s?.wins ?? 0,
          losses: s?.losses ?? 0,
          setsWon: s?.setsWon ?? 0,
          setsLost: s?.setsLost ?? 0,
          pointsFor: s?.pointsFor ?? 0,
          pointsAgainst: s?.pointsAgainst ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.setsWon - b.setsLost - (a.setsWon - a.setsLost) ||
          b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
      );
  }, [teams, teamStats]);

  const leaderboard = useMemo(() => {
    return playerStats
      .map((p) => ({
        ...p,
        points: computeLeaderboardValue(p as Record<string, unknown>, { stats: configStats }),
      }))
      .filter((p) => p.points !== 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
  }, [playerStats, configStats]);

  if (matches === null) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        Loading tournament data…
      </div>
    );
  }

  const hasNativeData = matches.length > 0 || teams.length > 0;
  // Sheet-only tournaments (or before tracker data exists): show the configured embed
  // instead of empty native tab panels — same fallback as the former LiveTournament.
  if (!hasNativeData && sheetSrc) {
    return <LiveIframe src={sheetSrc} title={pageTitle} fillPage defaultScale={0.5} />;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start">
        {enabledTabs.map((tabId) => (
          <TabsTrigger key={tabId} value={tabId} className="text-sm">
            {PUBLIC_TOURNAMENT_TAB_LABELS[tabId]}
          </TabsTrigger>
        ))}
      </TabsList>

      {enabledTabs.includes("schedule") && (
        <TabsContent value="schedule" className="mt-0">
          {upcoming.length === 0 && completed.length === 0 ? (
            <EmptyState message="Schedule will appear here once matches are created." />
          ) : (
            <div className="grid gap-2">
              {[...upcoming, ...completed].map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="font-medium">
                    {teamName(m.teamAId)} <span className="text-muted-foreground">vs</span>{" "}
                    {teamName(m.teamBId)}
                  </div>
                  {m.status === "COMPLETED" ? (
                    <div className="text-sm tabular-nums">
                      <span className="font-bold">
                        {m.scoreA ?? 0}–{m.scoreB ?? 0}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        · {teamName(m.winnerTeamId)} won
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {m.scheduledAt?.seconds
                        ? new Date(m.scheduledAt.seconds * 1000).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Upcoming"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("scoreboard") && (
        <TabsContent value="scoreboard" className="mt-0">
          {liveMatches.length === 0 ? (
            <EmptyState message="No matches in progress right now." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {liveMatches.map((m) => {
                const set = m.currentSet ?? 1;
                const live = m.setScores?.[set - 1] ?? { a: 0, b: 0 };
                return (
                  <div key={m.id} className="rounded-2xl border bg-card p-5">
                    <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                      Set {set}
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                      </span>
                      Live
                    </div>
                    <div className="grid grid-cols-3 items-center text-center">
                      <div>
                        <div className="font-semibold truncate">{teamName(m.teamAId)}</div>
                        <div className="text-4xl font-extrabold tabular-nums mt-1">{live.a}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Sets {m.scoreA ?? 0}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-sm font-medium">vs</div>
                      <div>
                        <div className="font-semibold truncate">{teamName(m.teamBId)}</div>
                        <div className="text-4xl font-extrabold tabular-nums mt-1">{live.b}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Sets {m.scoreB ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("leaderboard") && (
        <TabsContent value="leaderboard" className="mt-0">
          {leaderboard.length === 0 ? (
            <EmptyState message="Leaderboard will populate as stats are recorded." />
          ) : (
            <div className="rounded-2xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Player</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    {leaderboardColumns.map((c) => (
                      <th key={c.field} className="px-3 py-2 font-medium text-center">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium text-center">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? "bg-muted/20" : undefined}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{p.displayName ?? "Player"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {teamName(p.teamId as string)}
                      </td>
                      {leaderboardColumns.map((c) => (
                        <td key={c.field} className="px-3 py-2 text-center tabular-nums">
                          {(p as any)[c.field] ?? 0}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{p.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("standings") && (
        <TabsContent value="standings" className="mt-0">
          {standings.length === 0 ? (
            <EmptyState message="Standings will appear once teams are added." />
          ) : (
            <div className="rounded-2xl border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium text-center">W</th>
                    <th className="px-3 py-2 font-medium text-center">L</th>
                    <th className="px-3 py-2 font-medium text-center">Sets</th>
                    <th className="px-3 py-2 font-medium text-center">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.teamId} className={i % 2 ? "bg-muted/20" : undefined}>
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.losses}</td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.setsWon}–{s.setsLost}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.pointsFor - s.pointsAgainst > 0 ? "+" : ""}
                        {s.pointsFor - s.pointsAgainst}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("live_sheet") && (
        <TabsContent value="live_sheet" className="mt-0">
          {sheetSrc ? (
            <LiveIframe src={sheetSrc} title={pageTitle} fillPage defaultScale={0.5} />
          ) : (
            <EmptyState message="No live sheet configured for this tournament." />
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground text-center">
      {message}
    </div>
  );
}
