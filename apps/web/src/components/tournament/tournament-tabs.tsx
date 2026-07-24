"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  buildPlayoffResultsMap,
  buildPlayoffTeamMetaFromSeeds,
  applyReseedIntentToStructure,
  colorForStatCategory,
  computeLeaderboardValue,
  filterTeamsForStandingsScope,
  materializePlayoffStructure,
  normalizeTrackerConfig,
  playerHasLeaderboardActivity,
  rankStandings,
  resolvePlayoffChampion,
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
import { PublicLeaderboard } from "@/components/tournament/public-leaderboard";
import { PublicTeams, type PublicTeamsPlayerDoc } from "@/components/tournament/public-teams";
import { PlayoffBracketView } from "@/components/tournament/playoff-bracket-view";
import { PlayoffChampionHero, useChampionRoster } from "@/components/tournament/playoff-champion-hero";
import { Button } from "@/components/ui/button";
import { ColorBadge } from "@/components/ui/color-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  PUBLIC_TOURNAMENT_TAB_LABELS,
  type PublicTournamentTabId,
} from "@/lib/public-tournament-tabs";

const volleyballDefaults = tryGetSportContainerBySport("volleyball")?.defaultConfig();
const defaultNormalized = volleyballDefaults
  ? normalizeTrackerConfig(volleyballDefaults).config
  : null;
const defaultLeaderboardColumns = defaultNormalized
  ? trackerConfigLeaderboardColumns(defaultNormalized)
  : [];
const defaultConfigStats = defaultNormalized?.stats ?? [];
const defaultPointsColor = defaultNormalized
  ? colorForStatCategory(defaultNormalized.colors, "positive_points")
  : undefined;
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
  trackingTeamId?: string | null;
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
  defaultTab,
  sheetSrc,
  pageTitle,
}: {
  tournamentId: string;
  enabledTabs: PublicTournamentTabId[];
  /** Initial tab on first load; falls back to the first enabled tab. */
  defaultTab?: PublicTournamentTabId;
  sheetSrc?: string;
  pageTitle: string;
}) {
  const initialTab =
    defaultTab && enabledTabs.includes(defaultTab)
      ? defaultTab
      : (enabledTabs[0] ?? "schedule");
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [matches, setMatches] = useState<MatchDoc[] | null>(null);
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [divisions, setDivisions] = useState<DivisionDoc[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsDoc[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatsDoc[]>([]);
  const [leaderboardColumns, setLeaderboardColumns] = useState(defaultLeaderboardColumns);
  const [pointsColumnColor, setPointsColumnColor] = useState<string | undefined>(
    defaultPointsColor
  );
  const [configStats, setConfigStats] = useState<TrackerStat[]>(defaultConfigStats);
  const [sport, setSport] = useState<string>("volleyball");
  const [periodsWonLabel, setPeriodsWonLabel] = useState(defaultPeriodsWonLabel);
  const [standingsConfig, setStandingsConfig] = useState<StandingsConfig>(() =>
    resolveStandingsConfig(undefined)
  );
  const [playoffStructure, setPlayoffStructure] = useState<PlayoffBracketStructure | null>(null);
  const [playoffSeeds, setPlayoffSeeds] = useState<PlayoffSeed[]>([]);
  const [playoffReseedRoundKeys, setPlayoffReseedRoundKeys] = useState<string[]>([]);
  const [championTeamId, setChampionTeamId] = useState<string | null>(null);
  const [standingsScopeKey, setStandingsScopeKey] = useState<StandingsScopeKey>("all");
  const [rosterPlayerDocs, setRosterPlayerDocs] = useState<PublicTeamsPlayerDoc[] | null>(null);

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
      const { config } = normalizeTrackerConfig({
        sport,
        stats: data.stats,
        colors: data.colors,
        layout: data.layout,
        setRules: data.setRules,
      } as any);
      setConfigStats(config.stats);
      setLeaderboardColumns(trackerConfigLeaderboardColumns(config));
      setPointsColumnColor(colorForStatCategory(config.colors, "positive_points"));
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
        setChampionTeamId(
          typeof data?.championTeamId === "string" ? data.championTeamId : null
        );
        const id = data?.statTrackerId;
        if (id) {
          const sportId = sportFromStatTrackerId(String(id));
          setSport(sportId);
          const container = tryGetSportContainerBySport(sportId);
          if (container) {
            setPeriodsWonLabel(container.periodsWonLabel);
            const { config: seeded } = normalizeTrackerConfig(container.defaultConfig());
            setConfigStats(seeded.stats);
            setLeaderboardColumns(trackerConfigLeaderboardColumns(seeded));
            setPointsColumnColor(
              colorForStatCategory(seeded.colors, "positive_points")
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

  // Live player docs for the Teams tab (kept at parent so tab switches stay instant).
  const teamsTabEnabled = enabledTabs.includes("teams");
  useEffect(() => {
    if (!db || !teamsTabEnabled) {
      setRosterPlayerDocs(null);
      return;
    }
    const unsub = onSnapshot(collection(db, "tournaments", tournamentId, "players"), (snap) => {
      setRosterPlayerDocs(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PublicTeamsPlayerDoc, "id">) }))
      );
    });
    return () => unsub();
  }, [tournamentId, teamsTabEnabled]);

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
          trackingTeamId: m.trackingTeamId ?? null,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          currentSet: m.currentSet,
          setScores: m.setScores,
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

  const displayChampionTeamId = useMemo(() => {
    if (championTeamId) return championTeamId;
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
    return resolvePlayoffChampion(playoffStructure, results)?.teamId ?? null;
  }, [championTeamId, playoffStructure, publishedPlayoffMatches]);

  const teamColors = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const t of teams) map[t.id] = t.color;
    return map;
  }, [teams]);

  const championTeam = useMemo(() => {
    if (!displayChampionTeamId) return null;
    return teams.find((t) => t.id === displayChampionTeamId) ?? null;
  }, [displayChampionTeamId, teams]);

  const championPlayers = useChampionRoster(tournamentId, championTeam?.id ?? null);

  const leaderboard = useMemo(() => {
    return playerStats
      .map((p) => ({
        ...p,
        points: computeLeaderboardValue(p as Record<string, unknown>, { stats: configStats }),
      }))
      .filter((p) =>
        playerHasLeaderboardActivity(p as Record<string, unknown>, { stats: configStats })
      );
  }, [playerStats, configStats]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const divisionById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions]
  );

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
      <TabsList className="flex flex-wrap h-auto gap-1.5 w-full justify-start">
        {enabledTabs.map((tabId) => (
          <TabsTrigger key={tabId} value={tabId} className="text-sm md:text-base px-3 py-2">
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
            tournamentId={tournamentId}
            configStats={configStats}
            players={playerStats.map((p) => ({
              id: p.id,
              displayName: p.displayName ?? null,
            }))}
          />
        </TabsContent>
      )}

      {enabledTabs.includes("leaderboard") && (
        <TabsContent value="leaderboard" className="mt-0">
          <PublicLeaderboard
            players={leaderboard}
            teams={teams}
            columns={leaderboardColumns}
            pointsColor={pointsColumnColor}
          />
        </TabsContent>
      )}

      {enabledTabs.includes("standings") && (
        <TabsContent value="standings" className="mt-0 space-y-4">
          {showDivisionScopes ? (
            <div className="flex flex-wrap gap-2">
              {standingsScopeButtons.map((b) => (
                <Button
                  key={b.key}
                  type="button"
                  size="default"
                  variant={standingsScopeKey === b.key ? "default" : "outline"}
                  className={cn(
                    "text-base md:text-lg h-11 px-4",
                    standingsScopeKey === b.key && "pointer-events-none"
                  )}
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
            <div className="rounded-2xl border bg-card overflow-x-auto w-full">
              <table className="w-full text-lg md:text-xl">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="px-4 py-4 font-semibold">#</th>
                    <th className="px-4 py-4 font-semibold">Team</th>
                    {showDivisionScopes && standingsScopeKey === "all" ? (
                      <th className="px-4 py-4 font-semibold">Division</th>
                    ) : null}
                    <th className="px-4 py-4 font-semibold text-center">W</th>
                    <th className="px-4 py-4 font-semibold text-center">L</th>
                    <th
                      className="px-4 py-4 font-semibold text-center"
                      title="Wins in 2 sets (e.g. 2–0)"
                    >
                      W in 2
                    </th>
                    <th
                      className="px-4 py-4 font-semibold text-center"
                      title="Wins in 3 sets (e.g. 2–1)"
                    >
                      W in 3
                    </th>
                    <th className="px-4 py-4 font-semibold text-center">Tourney Pts</th>
                    <th className="px-4 py-4 font-semibold text-center">{periodsWonLabel}</th>
                    <th className="px-4 py-4 font-semibold text-center">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => {
                    const team = teamById.get(s.teamId);
                    const divId = team?.divisionId ?? null;
                    const divName = divId
                      ? divisionById.get(divId)?.name ?? "—"
                      : "Unassigned";
                    return (
                      <tr key={s.teamId} className={i % 2 ? "bg-muted/20" : undefined}>
                        <td className="px-4 py-4 tabular-nums text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-4 py-4 font-semibold">
                          <ColorBadge
                            name={s.name}
                            color={team?.color}
                            className="w-full text-lg md:text-xl px-4 py-2"
                          />
                        </td>
                        {showDivisionScopes && standingsScopeKey === "all" ? (
                          <td className="px-4 py-4 text-muted-foreground">{divName}</td>
                        ) : null}
                        <td className="px-4 py-4 text-center tabular-nums">{s.wins}</td>
                        <td className="px-4 py-4 text-center tabular-nums">{s.losses}</td>
                        <td className="px-4 py-4 text-center tabular-nums">{s.winsIn2Sets}</td>
                        <td className="px-4 py-4 text-center tabular-nums">{s.winsIn3Sets}</td>
                        <td className="px-4 py-4 text-center tabular-nums font-bold">
                          {s.tournamentPoints}
                        </td>
                        <td className="px-4 py-4 text-center tabular-nums">
                          {s.setsWon}–{s.setsLost}
                        </td>
                        <td className="px-4 py-4 text-center tabular-nums">
                          {s.pointDifferential > 0 ? "+" : ""}
                          {s.pointDifferential}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      )}

      {enabledTabs.includes("teams") && (
        <TabsContent value="teams" forceMount className={cn("mt-0", activeTab !== "teams" && "hidden")}>
          <PublicTeams
            tournamentId={tournamentId}
            teams={teams}
            divisions={divisions}
            playerDocs={rosterPlayerDocs}
          />
        </TabsContent>
      )}

      {enabledTabs.includes("playoffs") && (
        <TabsContent value="playoffs" className="mt-0">
          {!displayPlayoffStructure ? (
            <EmptyState message="Playoff bracket has not been published yet." />
          ) : (
            <div className="space-y-6 rounded-2xl border bg-card p-4 md:p-6 dark:border-slate-600 dark:bg-slate-950/40">
              {championTeam ? (
                <PlayoffChampionHero
                  name={championTeam.name}
                  color={championTeam.color}
                  players={championPlayers}
                />
              ) : null}
              <PlayoffBracketView
                structure={displayPlayoffStructure}
                feederStructure={playoffStructure ?? undefined}
                publishedMatches={publishedPlayoffMatches}
                interactiveHighlights={false}
                showBracketCode={false}
                battleStyle
                teamColors={teamColors}
                trackingTeams={teams.map((t) => ({ id: t.id, name: t.name }))}
                championTeamId={displayChampionTeamId}
                hint="Playoff bracket. Court and time appear once matches are scheduled. Use the side arrows when the tree is wider than the screen."
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
    <div className="rounded-2xl border bg-card p-8 text-base text-muted-foreground text-center md:text-lg">
      {message}
    </div>
  );
}
