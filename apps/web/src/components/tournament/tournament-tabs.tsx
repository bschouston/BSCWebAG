"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  buildPlayoffResultsMap,
  buildPlayoffTeamMetaFromSeeds,
  applyReseedIntentToStructure,
  computeLeaderboardValue,
  filterTeamsForStandingsScope,
  materializePlayoffStructure,
  playerHasLeaderboardActivity,
  rankStandings,
  resolvePlayoffConfig,
  resolveStandingsConfig,
  sportFromStatTrackerId,
  trackerConfigLeaderboardColumns,
  tryGetSportContainerBySport,
  type PlayoffBracketStructure,
  type PlayoffSeed,
  type StandingsConfig,
  type StandingsScope,
  type TrackerStat,
} from "@bsc/shared";
import { db } from "@/lib/firebase/client";
import { LiveIframe } from "@/components/live/live-iframe";
import { PublicSchedule } from "@/components/tournament/public-schedule";
import { PlayoffBracketView } from "@/components/tournament/playoff-bracket-view";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PUBLIC_TOURNAMENT_TAB_LABELS,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";
import { cn } from "@/lib/utils";

const volleyballDefaults = tryGetSportContainerBySport("volleyball")?.defaultConfig();
const defaultLeaderboardColumns =
  volleyballDefaults?.stats.map((s) => ({
    field: s.aggregateField,
    label: s.shortLabel,
  })) ?? [];
const defaultConfigStats = volleyballDefaults?.stats ?? [];
const defaultPeriodLabel = tryGetSportContainerBySport("volleyball")?.periodLabel ?? "Set";
const defaultPeriodsWonLabel =
  tryGetSportContainerBySport("volleyball")?.periodsWonLabel ?? "Sets";

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
  scheduledAt?: { seconds?: number; toDate?: () => Date } | null;
  courtNumber?: number;
  pairingType?: "DIVISION" | "CROSS";
  divisionId?: string | null;
  phase?: string;
  bracketMatchId?: string;
};

type TeamDoc = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};
type DivisionDoc = { id: string; name: string; color?: string | null };

type StandingsScopeKey = "all" | "unassigned" | string;

function standingsScopeFromKey(key: StandingsScopeKey): StandingsScope {
  if (key === "all") return { type: "all" };
  if (key === "unassigned") return { type: "unassigned" };
  return { type: "division", divisionId: key };
}

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
  const [divisions, setDivisions] = useState<DivisionDoc[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsDoc[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatsDoc[]>([]);
  const [leaderboardColumns, setLeaderboardColumns] = useState(defaultLeaderboardColumns);
  const [configStats, setConfigStats] = useState<TrackerStat[]>(defaultConfigStats);
  const [sport, setSport] = useState<string>("volleyball");
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel);
  const [periodsWonLabel, setPeriodsWonLabel] = useState(defaultPeriodsWonLabel);
  const [standingsConfig, setStandingsConfig] = useState<StandingsConfig>(() =>
    resolveStandingsConfig(undefined)
  );
  const [playoffStructure, setPlayoffStructure] = useState<PlayoffBracketStructure | null>(null);
  const [playoffSeeds, setPlayoffSeeds] = useState<PlayoffSeed[]>([]);
  const [playoffReseedRoundKeys, setPlayoffReseedRoundKeys] = useState<string[]>([]);
  const [standingsScopeKey, setStandingsScopeKey] = useState<StandingsScopeKey>("all");

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
        const data = snap.data() as any;
        setStandingsConfig(resolveStandingsConfig(data?.standingsConfig));
        const bracket = data?.playoffBracket;
        const structure = bracket?.structure;
        setPlayoffStructure(structure && typeof structure === "object" ? structure : null);
        setPlayoffSeeds(Array.isArray(bracket?.seeds) ? bracket.seeds : []);
        const playoffCfg = resolvePlayoffConfig(data?.playoffConfig);
        setPlayoffReseedRoundKeys(
          playoffCfg.reseedEnabled ? playoffCfg.reseedRoundKeys : []
        );
        const id = data?.statTrackerId;
        if (id) {
          const sportId = sportFromStatTrackerId(String(id));
          setSport(sportId);
          const container = tryGetSportContainerBySport(sportId);
          if (container) {
            setPeriodLabel(container.periodLabel);
            setPeriodsWonLabel(container.periodsWonLabel);
            const seeded = container.defaultConfig();
            setConfigStats(seeded.stats);
            setLeaderboardColumns(
              seeded.stats.map((s) => ({
                field: s.aggregateField,
                label: s.shortLabel,
              }))
            );
          }
        }
      }),
      onSnapshot(
        query(collection(tournamentRef, "matches"), orderBy("scheduledAt", "asc")),
        (snap) =>
          setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchDoc[])
      ),
      onSnapshot(collection(tournamentRef, "teams"), (snap) =>
        setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TeamDoc[])
      ),
      onSnapshot(collection(tournamentRef, "divisions"), (snap) =>
        setDivisions(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DivisionDoc[]
        )
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

  const showDivisionScopes = divisions.length > 1;
  const hasUnassignedTeams = useMemo(
    () => teams.some((t) => !t.divisionId),
    [teams]
  );

  useEffect(() => {
    if (!showDivisionScopes) {
      setStandingsScopeKey("all");
      return;
    }
    if (standingsScopeKey === "unassigned" && !hasUnassignedTeams) {
      setStandingsScopeKey("all");
      return;
    }
    if (
      standingsScopeKey !== "all" &&
      standingsScopeKey !== "unassigned" &&
      !divisions.some((d) => d.id === standingsScopeKey)
    ) {
      setStandingsScopeKey("all");
    }
  }, [showDivisionScopes, hasUnassignedTeams, divisions, standingsScopeKey]);

  const standings = useMemo(() => {
    const scope = showDivisionScopes
      ? standingsScopeFromKey(standingsScopeKey)
      : ({ type: "all" } as const);
    const scopedTeams = filterTeamsForStandingsScope(
      teams.map((t) => ({ id: t.id, name: t.name, divisionId: t.divisionId })),
      scope
    );
    return rankStandings({
      teams: scopedTeams.map((t) => ({ id: t.id, name: t.name })),
      teamStats: teamStats.map((s) => ({
        teamId: s.id,
        wins: s.wins,
        losses: s.losses,
        setsWon: s.setsWon,
        setsLost: s.setsLost,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
      })),
      matches: (matches ?? []).map((m) => ({
        id: m.id,
        status: m.status,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        winnerTeamId: m.winnerTeamId,
      })),
      config: standingsConfig,
    });
  }, [teams, teamStats, matches, standingsConfig, showDivisionScopes, standingsScopeKey]);

  const standingsScopeButtons: { key: StandingsScopeKey; label: string }[] = [
    { key: "all", label: "All" },
    ...divisions.map((d) => ({ key: d.id, label: d.name })),
    ...(hasUnassignedTeams
      ? [{ key: "unassigned" as const, label: "Unassigned" }]
      : []),
  ];

  const publishedPlayoffMatches = useMemo(() => {
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    return (matches ?? [])
      .filter((m) => m.phase === "PLAYOFF" && m.bracketMatchId)
      .map((m) => {
        let scheduledAt: string | null = null;
        const raw = m.scheduledAt;
        if (raw && typeof raw.toDate === "function") {
          scheduledAt = raw.toDate().toISOString();
        } else if (raw && typeof raw.seconds === "number") {
          scheduledAt = new Date(raw.seconds * 1000).toISOString();
        }
        const teamAId = m.teamAId ?? null;
        const teamBId = m.teamBId ?? null;
        return {
          bracketMatchId: String(m.bracketMatchId),
          courtNumber: m.courtNumber ?? null,
          scheduledAt,
          status: m.status,
          winnerTeamId: m.winnerTeamId ?? null,
          teamAId,
          teamBId,
          teamAName: teamAId ? nameById.get(teamAId) ?? null : null,
          teamBName: teamBId ? nameById.get(teamBId) ?? null : null,
        };
      });
  }, [matches, teams]);

  const displayPlayoffStructure = useMemo(() => {
    if (!playoffStructure) return null;
    const results = buildPlayoffResultsMap(
      publishedPlayoffMatches.map((p) => ({
        bracketMatchId: p.bracketMatchId,
        status: p.status,
        winnerTeamId: p.winnerTeamId,
        teamAId: p.teamAId,
        teamBId: p.teamBId,
      }))
    );
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    const teamMeta = buildPlayoffTeamMetaFromSeeds(playoffSeeds, nameById);
    const materialized = materializePlayoffStructure(playoffStructure, results, teamMeta);
    return applyReseedIntentToStructure(materialized, playoffReseedRoundKeys);
  }, [playoffStructure, publishedPlayoffMatches, playoffSeeds, teams, playoffReseedRoundKeys]);

  const leaderboard = useMemo(() => {
    return playerStats
      .map((p) => ({
        ...p,
        points: computeLeaderboardValue(p as Record<string, unknown>, { stats: configStats }),
      }))
      .filter((p) => playerHasLeaderboardActivity(p as Record<string, unknown>, { stats: configStats }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          (a.displayName ?? "").localeCompare(b.displayName ?? "")
      )
      .slice(0, 25);
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
          <PublicSchedule
            matches={matches.filter((m) => m.phase !== "PLAYOFF")}
            teams={teams}
            divisions={divisions}
          />
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
                      {periodLabel} {set}
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
                          {periodsWonLabel} {m.scoreA ?? 0}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-sm font-medium">vs</div>
                      <div>
                        <div className="font-semibold truncate">{teamName(m.teamBId)}</div>
                        <div className="text-4xl font-extrabold tabular-nums mt-1">{live.b}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {periodsWonLabel} {m.scoreB ?? 0}
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
        <TabsContent value="standings" className="mt-0 space-y-3">
          {showDivisionScopes ? (
            <div className="flex flex-wrap gap-1.5">
              {standingsScopeButtons.map((b) => (
                <Button
                  key={b.key}
                  type="button"
                  size="sm"
                  variant={standingsScopeKey === b.key ? "default" : "outline"}
                  className={cn(standingsScopeKey === b.key && "pointer-events-none")}
                  onClick={() => setStandingsScopeKey(b.key)}
                >
                  {b.label}
                </Button>
              ))}
            </div>
          ) : null}
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
                    <th className="px-3 py-2 font-medium text-center" title="Wins in 2 sets (e.g. 2–0)">
                      W in 2
                    </th>
                    <th className="px-3 py-2 font-medium text-center" title="Wins in 3 sets (e.g. 2–1)">
                      W in 3
                    </th>
                    <th className="px-3 py-2 font-medium text-center">Tourney Pts</th>
                    <th className="px-3 py-2 font-medium text-center">{periodsWonLabel}</th>
                    <th className="px-3 py-2 font-medium text-center">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.teamId} className={i % 2 ? "bg-muted/20" : undefined}>
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.losses}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.winsIn2Sets}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.winsIn3Sets}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold">
                        {s.tournamentPoints}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.setsWon}–{s.setsLost}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {s.pointDifferential > 0 ? "+" : ""}
                        {s.pointDifferential}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("playoffs") && (
        <TabsContent value="playoffs" className="mt-0">
          {!displayPlayoffStructure ? (
            <EmptyState message="Playoff bracket has not been published yet." />
          ) : (
            <div className="rounded-2xl border bg-card p-4 md:p-6">
              <PlayoffBracketView
                structure={displayPlayoffStructure}
                feederStructure={playoffStructure ?? undefined}
                publishedMatches={publishedPlayoffMatches}
                interactiveHighlights={false}
                hint="Playoff bracket. Court and time appear once matches are scheduled."
              />
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
