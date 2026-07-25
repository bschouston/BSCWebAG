"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button, cn } from "@bsc/ui";
import type { RankedTeam, TopScorerInfo } from "./standings-types";

export function TeamAvatar({
  team,
  size = "md",
  className,
}: {
  team: Pick<RankedTeam, "teamName" | "photoUrl">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 text-sm"
      : size === "md"
        ? "h-12 w-12 text-base"
        : size === "lg"
          ? "h-20 w-20 text-2xl"
          : "h-28 w-28 text-3xl";

  if (team.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.photoUrl}
        alt=""
        className={cn(
          "rounded-xl object-cover border border-border/80 shadow-sm",
          sizeClass,
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl bg-bsc-red/15 flex items-center justify-center font-extrabold text-bsc-red border border-bsc-red/20",
        sizeClass,
        className
      )}
    >
      {(team.teamName ?? "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

export function YouBadge() {
  return (
    <span className="ml-1.5 inline-flex align-middle text-[10px] font-bold uppercase tracking-wide rounded-full bg-primary text-primary-foreground px-2 py-0.5">
      You
    </span>
  );
}

export function LockBadge({ locked }: { locked?: boolean }) {
  if (!locked) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300"
      title="Locked"
    >
      <Lock className="h-3 w-3" />
      Locked
    </span>
  );
}

/** Twin stat blocks: Used | Unused as peer numbers (no bar). */
export function BudgetTwin({
  used,
  unused,
  maxBudget,
  className,
}: {
  used: number;
  unused: number | null;
  maxBudget: number | null;
  className?: string;
}) {
  const over = maxBudget != null && used > maxBudget;
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-muted/40 p-2",
        className
      )}
    >
      <div className="text-center">
        <div
          className={cn(
            "text-lg font-black tabular-nums leading-none",
            over ? "text-bsc-red" : "text-foreground"
          )}
        >
          {used}
        </div>
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Used{maxBudget != null ? ` / ${maxBudget}` : ""}
        </div>
      </div>
      <div className="text-center border-l border-border/70">
        <div className="text-lg font-black tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
          {unused ?? "—"}
        </div>
        <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Unused
        </div>
      </div>
    </div>
  );
}

export function StandingsPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">Showing 0 teams.</p>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        Showing {start}–{end} of {total} teams.
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous</span>
          </Button>
          <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function StandingRowLink({
  tournamentId,
  team,
  children,
  className,
}: {
  tournamentId: string;
  team: RankedTeam;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/t/${tournamentId}/teams/${team.id}`}
      className={cn(
        "block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-bsc-red/50",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function TopScorerBlock({
  topScorer,
  className,
  align = "left",
}: {
  topScorer: TopScorerInfo | null | undefined;
  className?: string;
  align?: "left" | "center";
}) {
  if (!topScorer) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-muted/30 px-3 py-2 w-full",
        align === "center" && "text-center",
        className
      )}
    >
      <div
        className={cn(
          "flex items-baseline gap-2",
          align === "center" ? "justify-center" : "justify-between"
        )}
      >
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Top scorer
          </div>
          <div className="text-sm font-extrabold truncate">
            {topScorer.number != null ? (
              <span className="text-muted-foreground mr-1">#{topScorer.number}</span>
            ) : null}
            {topScorer.displayName}
          </div>
        </div>
        <div className="shrink-0 text-sm font-black tabular-nums text-bsc-red">
          {topScorer.points.toFixed(1)}
        </div>
      </div>
      {topScorer.topStats.length > 0 ? (
        <div
          className={cn(
            "mt-1.5 flex flex-wrap gap-1.5",
            align === "center" && "justify-center"
          )}
        >
          {topScorer.topStats.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-bold tabular-nums"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label} {s.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PodiumHero({
  tournamentId,
  team,
  place,
  maxBudget,
}: {
  tournamentId: string;
  team: RankedTeam;
  place: 1 | 2 | 3;
  maxBudget: number | null;
}) {
  const accents =
    place === 1
      ? {
          border: "border-[#ffd700]/70",
          glow: "shadow-[0_12px_40px_-18px_rgba(255,215,0,0.55)]",
          bar: "from-[#ffd700] to-bsc-red",
          label: "1st",
          order: "order-1 md:order-2",
          scale: "md:scale-105 md:-mt-2",
          avatar: "xl" as const,
        }
      : place === 2
        ? {
            border: "border-[#c0c7d1]/70",
            glow: "shadow-[0_10px_32px_-18px_rgba(192,199,209,0.55)]",
            bar: "from-[#c0c7d1] to-primary",
            label: "2nd",
            order: "order-2 md:order-1",
            scale: "",
            avatar: "lg" as const,
          }
        : {
            border: "border-[#cd7f32]/70",
            glow: "shadow-[0_10px_32px_-18px_rgba(205,127,50,0.45)]",
            bar: "from-[#cd7f32] to-bsc-red",
            label: "3rd",
            order: "order-3 md:order-3",
            scale: "",
            avatar: "lg" as const,
          };

  return (
    <StandingRowLink
      tournamentId={tournamentId}
      team={team}
      className={cn(accents.order, accents.scale)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 bg-card p-4 sm:p-5 transition-transform duration-200 hover:-translate-y-0.5",
          accents.border,
          accents.glow,
          team.isMine && "ring-2 ring-primary/50"
        )}
      >
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r",
            accents.bar
          )}
        />
        <div className="flex flex-col items-center text-center gap-3 pt-1">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            {accents.label}
          </span>
          <TeamAvatar team={team} size={accents.avatar} />
          <div className="min-w-0 w-full">
            <div className="font-black text-lg sm:text-xl truncate">
              {team.teamName ?? "Untitled"}
              {team.isMine ? <YouBadge /> : null}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {team.ownerDisplayName ?? "Manager"}
            </div>
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-foreground">
              {team.fantasyPoints.toFixed(1)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Fantasy Pts
            </div>
          </div>
          <TopScorerBlock topScorer={team.topScorer} align="center" />
          <BudgetTwin
            used={team.budgetUsed}
            unused={team.budgetUnused}
            maxBudget={maxBudget}
            className="w-full"
          />
          <LockBadge locked={team.effectivelyLocked} />
        </div>
      </div>
    </StandingRowLink>
  );
}

export function PodiumTop3({
  tournamentId,
  teams,
  maxBudget,
}: {
  tournamentId: string;
  teams: RankedTeam[];
  maxBudget: number | null;
}) {
  const first = teams.find((t) => t.rank === 1);
  const second = teams.find((t) => t.rank === 2);
  const third = teams.find((t) => t.rank === 3);
  if (!first) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3 md:items-end">
      {second ? (
        <PodiumHero
          tournamentId={tournamentId}
          team={second}
          place={2}
          maxBudget={maxBudget}
        />
      ) : (
        <div className="hidden md:block" />
      )}
      <PodiumHero
        tournamentId={tournamentId}
        team={first}
        place={1}
        maxBudget={maxBudget}
      />
      {third ? (
        <PodiumHero
          tournamentId={tournamentId}
          team={third}
          place={3}
          maxBudget={maxBudget}
        />
      ) : (
        <div className="hidden md:block" />
      )}
    </div>
  );
}
