"use client";

import { cn } from "@bsc/ui";
import {
  BudgetTwin,
  LockBadge,
  PodiumTop3,
  StandingRowLink,
  TeamAvatar,
  TopScorerBlock,
  YouBadge,
} from "./standings-shared";
import type { StandingsProps } from "./standings-types";

/** Podium Top 3 + card grid, with twin Used | Unused budget blocks. */
export function ArenaStandings({
  tournamentId,
  teams,
  allRanked,
  page,
  searching,
  maxBudget,
}: StandingsProps) {
  const showPodium = page === 1 && !searching && allRanked.length > 0;
  const podiumRanks = new Set(
    showPodium ? allRanked.filter((t) => t.rank <= 3).map((t) => t.rank) : []
  );
  const cardRows = showPodium
    ? teams.filter((t) => !podiumRanks.has(t.rank))
    : teams;

  return (
    <div className="space-y-5">
      {showPodium ? (
        <PodiumTop3
          tournamentId={tournamentId}
          teams={allRanked.filter((t) => t.rank <= 3)}
          maxBudget={maxBudget}
        />
      ) : null}

      {cardRows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cardRows.map((team) => (
            <StandingRowLink
              key={team.id}
              tournamentId={tournamentId}
              team={team}
              className="h-full"
            >
              <div
                className={cn(
                  "group relative h-full overflow-hidden rounded-2xl border bg-card transition-all duration-200",
                  "hover:-translate-y-1 hover:border-bsc-red/50 hover:shadow-lg hover:shadow-bsc-red/10",
                  team.isMine && "ring-2 ring-primary/40 border-primary/30"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-bsc-red/10 pointer-events-none" />
                <div className="relative p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <TeamAvatar team={team} size="lg" />
                      <span
                        className={cn(
                          "absolute -top-2 -left-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full text-xs font-black tabular-nums shadow",
                          team.rank <= 3
                            ? "bg-bsc-red text-bsc-red-foreground"
                            : "bg-primary text-primary-foreground"
                        )}
                      >
                        {team.rank}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="font-extrabold text-lg leading-tight truncate">
                        {team.teamName ?? "Untitled team"}
                        {team.isMine ? <YouBadge /> : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {team.ownerDisplayName ?? "Manager"}
                      </div>
                      <div className="mt-1">
                        <LockBadge locked={team.effectivelyLocked} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className="text-3xl font-black tabular-nums tracking-tight group-hover:text-bsc-red transition-colors">
                        {team.fantasyPoints.toFixed(1)}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Fantasy Pts
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground tabular-nums">
                      {(team.playerIds ?? []).length} players
                    </div>
                  </div>

                  <TopScorerBlock topScorer={team.topScorer} />

                  <BudgetTwin
                    used={team.budgetUsed}
                    unused={team.budgetUnused}
                    maxBudget={maxBudget}
                  />
                </div>
              </div>
            </StandingRowLink>
          ))}
        </div>
      ) : null}

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No teams match this page.
        </p>
      ) : null}
    </div>
  );
}
