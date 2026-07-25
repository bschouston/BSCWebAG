"use client";

import { use, useEffect, useMemo, useState } from "react";
import {
  computeFantasyRosterCost,
  computeFantasyTeamValue,
  defaultFantasyConfig,
  type FantasyConfig,
} from "@bsc/shared";
import type { LeaderboardColumnDef } from "@bsc/shared";
import { Input } from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { useAuth } from "@/lib/auth-context";
import {
  useLiveTournamentStats,
  type LivePlayerRow,
} from "@/lib/use-live-tournament-stats";
import { ArenaStandings } from "./standings-arena";
import { StandingsPagination } from "./standings-shared";
import type { FantasyTeamRow, RankedTeam, TopScorerInfo } from "./standings-types";

const PAGE_SIZE = 15;

/** Highest-scoring rostered player plus their top 3 counting stats. */
function topScorerForRoster(
  playerIds: string[],
  livePlayers: LivePlayerRow[],
  columns: LeaderboardColumnDef[]
): TopScorerInfo | null {
  const rosterIds = new Set(playerIds);
  let best: LivePlayerRow | null = null;
  for (const p of livePlayers) {
    if (!rosterIds.has(p.id)) continue;
    if (!best || p.points > best.points) best = p;
  }
  if (!best) return null;

  const topStats = columns
    .map((col) => {
      const raw = best!.stats[col.field];
      const value = typeof raw === "number" ? raw : Number(raw ?? 0);
      return { label: col.label, value: Number.isFinite(value) ? value : 0, color: col.color };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return {
    displayName: best.displayName,
    number: best.number ?? null,
    points: best.points,
    topStats,
  };
}

export default function AllTeamsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, loading } = useAuth();
  const { tournamentName, config, statsById, livePlayers, leaderboardColumns } =
    useLiveTournamentStats(tournamentId);
  const [teams, setTeams] = useState<FantasyTeamRow[]>([]);
  const [fantasyConfig, setFantasyConfig] = useState<FantasyConfig>(defaultFantasyConfig());
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

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
      setTeams((data.teams ?? []) as FantasyTeamRow[]);
      if (data.config && typeof data.config === "object") {
        setFantasyConfig({ ...defaultFantasyConfig(), ...(data.config as object) });
      } else {
        setFantasyConfig(defaultFantasyConfig());
      }
      setBusy(false);
    };
    void run();
  }, [user, loading, tournamentId]);

  const maxBudget = useMemo(() => {
    const b = fantasyConfig.maxBudget;
    return typeof b === "number" && Number.isFinite(b) && b > 0 ? b : null;
  }, [fantasyConfig.maxBudget]);

  const allRanked = useMemo(() => {
    const mapped: RankedTeam[] = teams
      .map((t) => {
        const budgetUsed = computeFantasyRosterCost(
          t.playerIds ?? [],
          fantasyConfig.playerValues
        );
        const remaining = maxBudget == null ? null : maxBudget - budgetUsed;
        return {
          ...t,
          rank: 0,
          fantasyPoints: config
            ? computeFantasyTeamValue(t.playerIds ?? [], statsById, config)
            : 0,
          topScorer: topScorerForRoster(
            t.playerIds ?? [],
            livePlayers,
            leaderboardColumns
          ),
          budgetUsed,
          budgetUnused: remaining == null ? null : Math.max(remaining, 0),
          budgetPct:
            maxBudget != null && maxBudget > 0
              ? Math.min(100, (budgetUsed / maxBudget) * 100)
              : null,
        };
      })
      .sort(
        (a, b) =>
          b.fantasyPoints - a.fantasyPoints ||
          String(a.teamName ?? "").localeCompare(String(b.teamName ?? ""))
      )
      .map((t, i) => ({ ...t, rank: i + 1 }));
    return mapped;
  }, [
    teams,
    config,
    statsById,
    fantasyConfig.playerValues,
    maxBudget,
    livePlayers,
    leaderboardColumns,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRanked;
    return allRanked.filter(
      (t) =>
        String(t.teamName ?? "").toLowerCase().includes(q) ||
        String(t.ownerDisplayName ?? "").toLowerCase().includes(q)
    );
  }, [allRanked, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  if (loading || !user) return null;

  const searching = query.trim().length > 0;

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-muted-foreground">{tournamentName}</p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
            Standings
          </h1>
          <p className="text-muted-foreground mt-1">
            Live Fantasy Pts race ·{" "}
            {busy
              ? "Loading…"
              : `${teams.length} team${teams.length === 1 ? "" : "s"}`}
            {maxBudget != null ? ` · Budget ${maxBudget}` : ""}
          </p>
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team or manager…"
          className="max-w-sm h-11"
          aria-label="Search teams"
        />

        {filtered.length === 0 && !busy ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {teams.length === 0
              ? "No teams have been created yet."
              : "No teams match your search."}
          </p>
        ) : (
          <div className="space-y-5">
            <ArenaStandings
              tournamentId={tournamentId}
              teams={paged}
              allRanked={allRanked}
              page={safePage}
              searching={searching}
              maxBudget={maxBudget}
            />
            <StandingsPagination
              page={safePage}
              pageCount={pageCount}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </main>
    </FantasyShell>
  );
}
