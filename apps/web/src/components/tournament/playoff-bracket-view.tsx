"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import {
  FINAL_ROUND_KEY,
  PLAY_INS_ROUND_KEY,
  findRoundKeyForMatchId,
  formatBracketSlotRef,
  formatSetScores,
  getMatchDeleteBlockers,
  getMatchesForRoundKey,
  getPlayoffMatchDestinations,
  isRoundConcrete,
  isSlotReady,
  losersRoundKey,
  winnersRoundKey,
  type BracketMatch,
  type BracketSlotRef,
  type PlayoffBracketStructure,
} from "@bsc/shared";
import { cn } from "@/lib/utils";
import { readableTextColor } from "@/lib/color-contrast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorBadge } from "@/components/ui/color-badge";

const DEFAULT_TEAM_COLOR = "#1a3556";

export type PublishedPlayoffMatchInfo = {
  bracketMatchId: string;
  courtNumber?: number | null;
  scheduledAt?: string | null;
  firestoreId?: string;
  status?: string;
  playSeq?: number;
  startedAt?: unknown;
  completedAt?: unknown;
  lastPlayAt?: unknown;
  winnerTeamId?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
  teamAName?: string | null;
  teamBName?: string | null;
  trackingTeamId?: string | null;
  activeLockCount?: number;
  /** Active tracker locks (admin); used for Tracking line + release. */
  activeLocks?: { teamKey: "A" | "B"; ownerName: string }[];
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
};

export type PlayoffTrackingTeamOption = { id: string; name: string };

const NO_TRACKING_TEAM = "__none__";

type RoundColumn = {
  key: string;
  title: string;
  matches: BracketMatch[];
  rail: "winners" | "losers" | "final";
};

function slotMatchIds(ref: BracketSlotRef): string[] {
  if (ref.type === "winner" || ref.type === "loser") return [ref.matchId];
  return [];
}

function reseedFromKeys(ref: BracketSlotRef): string[] {
  if (ref.type === "reseed") return [ref.fromRoundKey];
  return [];
}

function relatedMatchIds(structure: PlayoffBracketStructure, matchId: string | null): Set<string> {
  const related = new Set<string>();
  if (!matchId) return related;
  related.add(matchId);

  const all: BracketMatch[] = [
    ...structure.playIns,
    ...structure.mainRounds.flatMap((r) => r.matches),
    ...structure.lowerRounds.flatMap((r) => r.matches),
    ...structure.finals,
  ];

  const active = all.find((m) => m.id === matchId);
  const activeRoundKey = findRoundKeyForMatchId(structure, matchId);

  for (const m of all) {
    const feeds = [...slotMatchIds(m.teamA), ...slotMatchIds(m.teamB)];
    if (m.id === matchId) {
      for (const id of feeds) related.add(id);
    }
    if (feeds.includes(matchId)) related.add(m.id);
  }

  if (active) {
    const fromKeys = new Set([
      ...reseedFromKeys(active.teamA),
      ...reseedFromKeys(active.teamB),
    ]);
    for (const key of fromKeys) {
      for (const m of getMatchesForRoundKey(structure, key)) {
        related.add(m.id);
      }
    }
  }

  if (activeRoundKey) {
    for (const m of all) {
      const fromA = reseedFromKeys(m.teamA);
      const fromB = reseedFromKeys(m.teamB);
      if (fromA.includes(activeRoundKey) || fromB.includes(activeRoundKey)) {
        related.add(m.id);
      }
    }
  }

  return related;
}

function buildWinnersColumns(structure: PlayoffBracketStructure): RoundColumn[] {
  const cols: RoundColumn[] = [];
  if (structure.playIns.length) {
    cols.push({
      key: PLAY_INS_ROUND_KEY,
      title: "Play-ins",
      matches: structure.playIns,
      rail: "winners",
    });
  }
  for (const round of structure.mainRounds) {
    cols.push({
      key: winnersRoundKey(round.roundNumber),
      title: round.title,
      matches: round.matches,
      rail: "winners",
    });
  }
  if (structure.finals.length) {
    cols.push({
      key: FINAL_ROUND_KEY,
      title: "Final",
      matches: structure.finals,
      rail: "final",
    });
  }
  return cols;
}

function buildLosersColumns(structure: PlayoffBracketStructure): RoundColumn[] {
  return structure.lowerRounds.map((round) => ({
    key: losersRoundKey(round.label),
    title: `Losers ${round.label}`,
    matches: round.matches,
    rail: "losers" as const,
  }));
}

function formatCourtTime(info?: PublishedPlayoffMatchInfo): string | null {
  if (!info?.courtNumber || !info.scheduledAt) return null;
  const d = new Date(info.scheduledAt);
  if (Number.isNaN(d.getTime())) return `Court ${info.courtNumber}`;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Court ${info.courtNumber} · ${time}`;
}

function slotLabel(ref: BracketSlotRef, publishedName?: string | null): string {
  if (ref.type === "team") {
    const name = publishedName?.trim() || ref.name;
    return `#${ref.seed} ${name}`;
  }
  if (publishedName) return publishedName;
  return formatBracketSlotRef(ref);
}

function slotTeamId(ref: BracketSlotRef, publishedId?: string | null): string | null {
  if (publishedId) return publishedId;
  if (ref.type === "team") return ref.teamId;
  return null;
}

function completedOutcomeLines(
  match: BracketMatch,
  published: PublishedPlayoffMatchInfo,
  feederStructure: PlayoffBracketStructure
): { winnerLine: string; loserLine: string } | null {
  if (String(published.status ?? "") !== "COMPLETED") return null;
  const dest = getPlayoffMatchDestinations(feederStructure, match.id);
  const winnerId = published.winnerTeamId ?? null;
  let winnerName: string | null = null;
  let loserName: string | null = null;
  if (winnerId && published.teamAId === winnerId) {
    winnerName = published.teamAName ?? null;
    loserName = published.teamBName ?? null;
  } else if (winnerId && published.teamBId === winnerId) {
    winnerName = published.teamBName ?? null;
    loserName = published.teamAName ?? null;
  } else {
    winnerName = published.teamAName ?? published.teamBName ?? null;
    loserName =
      published.teamAName && published.teamBName
        ? published.teamAName === winnerName
          ? published.teamBName
          : published.teamAName
        : null;
  }
  const winnerDest =
    dest.winnerTo.length > 0
      ? dest.winnerTo.join(", ")
      : "Champion";
  const loserDest = dest.loserEliminated
    ? "Eliminated"
    : dest.loserTo.length > 0
      ? dest.loserTo.join(", ")
      : "Eliminated";
  return {
    winnerLine: `Winner${winnerName ? ` ${winnerName}` : ""} → ${winnerDest}`,
    loserLine: `Loser${loserName ? ` ${loserName}` : ""} → ${loserDest}`,
  };
}

function statusChip(status?: string, _isFinal?: boolean): { label: string; className: string } | null {
  const s = String(status ?? "");
  if (s === "IN_PROGRESS") {
    return {
      label: "Live",
      className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    };
  }
  if (s === "COMPLETED") {
    return {
      label: "Completed",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
    };
  }
  if (s === "UPCOMING") {
    return {
      label: "Upcoming",
      className: "bg-muted text-muted-foreground border-border",
    };
  }
  return null;
}

/** Delete blockers for a published playoff match (COMPLETED blocked). */
export function getPublishedMatchDeleteBlockers(info: PublishedPlayoffMatchInfo): string[] {
  return getMatchDeleteBlockers(
    {
      status: info.status,
      phase: "PLAYOFF",
      playSeq: info.playSeq,
      startedAt: info.startedAt,
      completedAt: info.completedAt,
      lastPlayAt: info.lastPlayAt,
      winnerTeamId: info.winnerTeamId,
    },
    { activeLockCount: info.activeLockCount ?? 0 }
  );
}

/** Edit teams/court/time: UPCOMING only; block IN_PROGRESS, COMPLETED, and locks. */
export function getPublishedMatchEditBlockers(info: PublishedPlayoffMatchInfo): string[] {
  const blockers: string[] = [];
  const status = String(info.status ?? "UPCOMING");
  if (status === "IN_PROGRESS") {
    blockers.push("Match is in progress");
  } else if (status === "COMPLETED") {
    blockers.push("Completed matches cannot be edited");
  } else if (status !== "UPCOMING") {
    blockers.push(`Unsupported match status: ${status}`);
  }
  if ((info.activeLockCount ?? 0) > 0) {
    blockers.push("Active tracker lock — release locks first");
  }
  return blockers;
}

/** @deprecated Prefer getPublishedMatchDeleteBlockers / getPublishedMatchEditBlockers */
export function getPublishedMatchBlockers(info: PublishedPlayoffMatchInfo): string[] {
  return getPublishedMatchDeleteBlockers(info);
}

const selectCheckboxClass =
  "size-5 border-2 border-teal-700 bg-white shadow-sm data-[state=checked]:bg-teal-700 data-[state=checked]:border-teal-700 data-[state=checked]:text-white dark:border-teal-400 dark:bg-background dark:data-[state=checked]:bg-teal-500 dark:data-[state=checked]:border-teal-500";

function ColumnConnectors({
  leftMatches,
  rightMatches,
}: {
  leftMatches: BracketMatch[];
  rightMatches: BracketMatch[];
}) {
  const leftIndex = useMemo(
    () => new Map(leftMatches.map((m, i) => [m.id, i])),
    [leftMatches]
  );

  const paths = useMemo(() => {
    const H = 100;
    const W = 28;
    const out: string[] = [];
    rightMatches.forEach((rm, ri) => {
      const yRight = ((ri + 0.5) / Math.max(rightMatches.length, 1)) * H;
      const feeders = [...slotMatchIds(rm.teamA), ...slotMatchIds(rm.teamB)]
        .map((id) => leftIndex.get(id))
        .filter((i): i is number => i != null);
      if (!feeders.length) {
        out.push(`M 0 ${yRight} H ${W}`);
        return;
      }
      const midX = W / 2;
      for (const li of feeders) {
        const yLeft = ((li + 0.5) / Math.max(leftMatches.length, 1)) * H;
        out.push(`M 0 ${yLeft} H ${midX} V ${yRight} H ${W}`);
      }
    });
    return out;
  }, [leftIndex, leftMatches.length, rightMatches]);

  return (
    <div className="w-7 self-stretch shrink-0 relative min-h-[8rem]" aria-hidden>
      <svg
        className="absolute inset-0 h-full w-full text-muted-foreground/50 dark:text-slate-400"
        viewBox="0 0 28 100"
        preserveAspectRatio="none"
      >
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function BattleTeamBlock({
  name,
  color,
  isPlaceholder,
  isWinner,
  isLoser,
  isChampion,
  setsWon,
  showSetsWon,
}: {
  name: string;
  color?: string | null;
  isPlaceholder?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  isChampion?: boolean;
  setsWon?: number;
  showSetsWon?: boolean;
}) {
  if (isPlaceholder) {
    return (
      <div
        className="flex min-w-0 w-full items-center justify-center rounded-lg px-2 py-2 text-center"
        title={name}
      >
        <span className="text-xs font-medium italic leading-tight text-muted-foreground dark:text-slate-400 sm:text-sm">
          {name}
        </span>
      </div>
    );
  }

  const bg = color || DEFAULT_TEAM_COLOR;
  return (
    <div
      className={cn(
        "relative flex min-w-0 w-full items-center gap-2 rounded-lg px-2.5 py-2 transition-opacity",
        isLoser && "opacity-55",
        isWinner && "outline outline-2 outline-black outline-offset-1 dark:outline-white"
      )}
      style={{
        backgroundColor: bg,
        color: readableTextColor(bg),
      }}
    >
      {isChampion ? (
        <span className="absolute -top-2 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          <Crown className="size-2.5" aria-hidden />
          Champion
        </span>
      ) : null}
      <div className="min-w-0 flex-1 text-left text-sm font-extrabold leading-tight sm:text-base truncate" title={name}>
        {name}
      </div>
      {showSetsWon ? (
        <div className="shrink-0 text-xl font-black tabular-nums leading-none sm:text-2xl">
          {setsWon ?? 0}
        </div>
      ) : null}
    </div>
  );
}

function MatchCard({
  match,
  highlighted,
  onActivate,
  published,
  feederStructure,
  selectable,
  selected,
  onToggleSelect,
  showMatchId,
  showBracketCode,
  managePublished,
  onEditPublished,
  onDeletePublished,
  onReleaseLocks,
  busyFirestoreId,
  teamColors,
  championTeamId,
  isFinalRail,
  battleStyle,
  enableStatTrackingTeams,
  trackingTeams,
  onTrackingTeamChange,
  savingTrackingMatchId,
}: {
  match: BracketMatch;
  highlighted?: boolean;
  onActivate?: (id: string | null) => void;
  published?: PublishedPlayoffMatchInfo;
  feederStructure: PlayoffBracketStructure;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, checked: boolean) => void;
  showMatchId?: boolean;
  showBracketCode?: boolean;
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  onReleaseLocks?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  teamColors?: Record<string, string | null | undefined>;
  championTeamId?: string | null;
  isFinalRail?: boolean;
  battleStyle?: boolean;
  enableStatTrackingTeams?: boolean;
  trackingTeams?: PlayoffTrackingTeamOption[];
  onTrackingTeamChange?: (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => void;
  savingTrackingMatchId?: string | null;
}) {
  const meta = formatCourtTime(published);
  const deleteBlockers = published ? getPublishedMatchDeleteBlockers(published) : [];
  const editBlockers = published ? getPublishedMatchEditBlockers(published) : [];
  const canEdit = !!published?.firestoreId && editBlockers.length === 0;
  const canDelete = !!published?.firestoreId && deleteBlockers.length === 0;
  const busy = published?.firestoreId != null && busyFirestoreId === published.firestoreId;
  const teamALabel = slotLabel(match.teamA, published?.teamAName);
  const teamBLabel = slotLabel(match.teamB, published?.teamBName);
  const teamAId = slotTeamId(match.teamA, published?.teamAId);
  const teamBId = slotTeamId(match.teamB, published?.teamBId);
  const outcomes =
    published != null ? completedOutcomeLines(match, published, feederStructure) : null;
  const chip = statusChip(published?.status, isFinalRail);
  const winnerId = published?.winnerTeamId ?? null;
  const status = String(published?.status ?? "");
  const isLive = status === "IN_PROGRESS";
  const isCompleted = status === "COMPLETED";
  const aWins = isCompleted && !!winnerId && winnerId === teamAId;
  const bWins = isCompleted && !!winnerId && winnerId === teamBId;
  const isChampionWinner =
    !!championTeamId && !!winnerId && championTeamId === winnerId && isFinalRail;
  const showScores = isLive || isCompleted;
  const hasCourtTime =
    published?.courtNumber != null || !!published?.scheduledAt;
  const trackingId = published?.trackingTeamId?.trim() || null;
  const trackingLabel =
    trackingId == null
      ? null
      : trackingTeams?.find((t) => t.id === trackingId)?.name ?? trackingId;
  const eligibleTrackingTeams = (trackingTeams ?? []).filter(
    (t) => t.id !== teamAId && t.id !== teamBId
  );
  const showTrackingSelect =
    !!managePublished &&
    !!enableStatTrackingTeams &&
    !!published?.firestoreId &&
    !!onTrackingTeamChange;
  const trackingSelectBusy =
    !!published?.firestoreId && savingTrackingMatchId === published.firestoreId;

  if (battleStyle) {
    const trackingColor =
      (trackingId && teamColors?.[trackingId]) || DEFAULT_TEAM_COLOR;
    return (
      <div
        className={cn(
          "relative rounded-xl border bg-card shadow-sm transition-colors min-w-[15.5rem] max-w-[18rem]",
          "dark:border-slate-600 dark:bg-slate-950/80 dark:shadow-none",
          highlighted && "ring-2 ring-teal-500/40",
          onActivate && "cursor-pointer",
          selected && "ring-1 ring-teal-600/40",
          isFinalRail && "border-emerald-500/40 dark:border-emerald-400/50",
          isLive && "ring-2 ring-red-500/40 dark:ring-red-400/60",
          isCompleted && (aWins || bWins) && "border-emerald-600/40 dark:border-emerald-400/45"
        )}
        onMouseEnter={onActivate ? () => onActivate(match.id) : undefined}
        onMouseLeave={onActivate ? () => onActivate(null) : undefined}
        onFocus={onActivate ? () => onActivate(match.id) : undefined}
        onBlur={onActivate ? () => onActivate(null) : undefined}
        tabIndex={onActivate ? 0 : undefined}
      >
        {hasCourtTime ? (
          <span className="absolute -top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-semibold text-background sm:text-xs">
            {published?.courtNumber != null ? <span>Court {published.courtNumber}</span> : null}
            {published?.courtNumber != null && published?.scheduledAt ? (
              <span className="opacity-60" aria-hidden>
                ·
              </span>
            ) : null}
            {published?.scheduledAt ? (
              <span>
                {new Date(published.scheduledAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </span>
        ) : null}
        <div
          className={cn(
            "space-y-2 px-2.5",
            hasCourtTime ? "pt-6" : "pt-3",
            trackingId ? "pb-6" : isLive ? "pb-5" : "pb-3"
          )}
        >
          <div className="space-y-1.5">
            <BattleTeamBlock
              name={teamALabel}
              color={teamAId ? teamColors?.[teamAId] : undefined}
              isPlaceholder={!teamAId}
              isWinner={aWins}
              isLoser={isCompleted && !aWins && !!winnerId}
              isChampion={isChampionWinner && aWins}
              showSetsWon={showScores && !!teamAId}
              setsWon={published?.scoreA ?? 0}
            />
            <div className="flex flex-col items-center justify-center gap-0.5 py-0.5">
              <span className="text-[10px] font-extrabold tracking-widest text-muted-foreground dark:text-slate-300">
                VS
              </span>
              {isLive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-600" />
                  </span>
                  Live
                </span>
              ) : null}
            </div>
            <BattleTeamBlock
              name={teamBLabel}
              color={teamBId ? teamColors?.[teamBId] : undefined}
              isPlaceholder={!teamBId}
              isWinner={bWins}
              isLoser={isCompleted && !bWins && !!winnerId}
              isChampion={isChampionWinner && bWins}
              showSetsWon={showScores && !!teamBId}
              setsWon={published?.scoreB ?? 0}
            />
          </div>
        </div>
        {trackingId ? (
          <span
            className="absolute -bottom-2.5 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight"
            style={{
              backgroundColor: trackingColor,
              color: readableTextColor(trackingColor),
            }}
            title={`Stats - ${trackingLabel}`}
          >
            Stats - {trackingLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Fixed width so live/admin extras (locks, buttons) grow taller, not wider —
        // otherwise SVG connectors between columns stay at the old column edge.
        "box-border w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-background px-3 py-2.5 text-sm shadow-sm transition-colors",
        "dark:border-slate-600",
        highlighted && "border-teal-600 ring-2 ring-teal-500/40 bg-teal-50 dark:bg-teal-950/40",
        onActivate && "cursor-pointer hover:border-teal-500/60",
        selected && "border-teal-600 ring-1 ring-teal-600/30",
        isFinalRail && "border-emerald-500/40 dark:border-emerald-400/50",
        isLive && "border-red-500/40 ring-1 ring-red-500/20 dark:ring-red-400/50"
      )}
      onMouseEnter={onActivate ? () => onActivate(match.id) : undefined}
      onMouseLeave={onActivate ? () => onActivate(null) : undefined}
      onFocus={onActivate ? () => onActivate(match.id) : undefined}
      onBlur={onActivate ? () => onActivate(null) : undefined}
      tabIndex={onActivate ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {showBracketCode ? (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
              {match.id}
            </div>
          ) : null}
          {chip ? (
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                chip.className
              )}
            >
              {chip.label}
            </span>
          ) : null}
          {isChampionWinner ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              <Crown className="size-3" aria-hidden />
              Champion
            </span>
          ) : null}
        </div>
        {selectable ? (
          <Checkbox
            className={selectCheckboxClass}
            checked={!!selected}
            onCheckedChange={(v) => onToggleSelect?.(match.id, v === true)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${match.id}`}
          />
        ) : null}
      </div>
      {showMatchId && published?.firestoreId ? (
        <div className="mb-1 truncate text-[10px] text-muted-foreground" title={published.firestoreId}>
          MatchID: <span className="font-mono">{published.firestoreId}</span>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <div
          className={cn(
            "flex items-center gap-1.5 min-w-0",
            winnerId && teamAId === winnerId && "opacity-100",
            winnerId && teamAId && teamAId !== winnerId && "opacity-60"
          )}
        >
          <ColorBadge
            name={teamALabel}
            color={teamAId ? teamColors?.[teamAId] : undefined}
            score={showScores ? published?.scoreA ?? 0 : null}
            className={cn(
              "w-full max-w-full text-xs sm:text-sm",
              aWins && "outline outline-2 outline-offset-1 outline-black dark:outline-white"
            )}
          />
        </div>
        <div className="text-[10px] text-muted-foreground text-center">vs</div>
        <div
          className={cn(
            "flex items-center gap-1.5 min-w-0",
            winnerId && teamBId === winnerId && "opacity-100",
            winnerId && teamBId && teamBId !== winnerId && "opacity-60"
          )}
        >
          <ColorBadge
            name={teamBLabel}
            color={teamBId ? teamColors?.[teamBId] : undefined}
            score={showScores ? published?.scoreB ?? 0 : null}
            className={cn(
              "w-full max-w-full text-xs sm:text-sm",
              bWins && "outline outline-2 outline-offset-1 outline-black dark:outline-white"
            )}
          />
        </div>
      </div>
      {showScores && formatSetScores(published?.setScores) ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
          ({formatSetScores(published?.setScores)})
        </div>
      ) : null}
      {meta ? (
        <div className="mt-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          {meta}
        </div>
      ) : published ? (
        <div className="mt-2 text-[10px] text-muted-foreground">Published</div>
      ) : null}
      {managePublished && published && (isLive || (published.activeLocks?.length ?? 0) > 0) ? (
        <div
          className={cn(
            "mt-1.5 break-words rounded-md px-1.5 py-1 text-[11px] font-semibold leading-snug",
            (published.activeLocks?.length ?? 0) > 0
              ? "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200"
              : "bg-muted/60 text-muted-foreground"
          )}
          title={
            (published.activeLocks?.length ?? 0) > 0
              ? published.activeLocks!
                  .map((l) => {
                    const name =
                      l.teamKey === "A"
                        ? published.teamAName ?? "Team A"
                        : published.teamBName ?? "Team B";
                    return `${name} — ${l.ownerName}`;
                  })
                  .join(" · ")
              : undefined
          }
        >
          {(published.activeLocks?.length ?? 0) > 0 ? (
            <>
              Tracker lock:{" "}
              {published.activeLocks!
                .map((l) => {
                  const name =
                    l.teamKey === "A"
                      ? published.teamAName ?? "Team A"
                      : published.teamBName ?? "Team B";
                  return `${name} — ${l.ownerName}`;
                })
                .join(" · ")}
            </>
          ) : (
            <>Tracker lock: none</>
          )}
        </div>
      ) : null}
      {outcomes ? (
        <div className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-muted-foreground">
          <div className="truncate" title={outcomes.winnerLine}>
            {outcomes.winnerLine}
          </div>
          <div className="truncate" title={outcomes.loserLine}>
            {outcomes.loserLine}
          </div>
        </div>
      ) : null}
      {showTrackingSelect && published ? (
        <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
          <label
            htmlFor={`playoff-tracking-${published.firestoreId}`}
            className="text-[10px] font-medium text-muted-foreground"
          >
            Stats team
          </label>
          <select
            id={`playoff-tracking-${published.firestoreId}`}
            className="h-7 w-full min-w-0 max-w-full rounded-md border bg-background px-1.5 text-[11px]"
            disabled={trackingSelectBusy || busy}
            value={trackingId ?? NO_TRACKING_TEAM}
            onChange={(e) => {
              const v = e.target.value;
              onTrackingTeamChange?.(
                published,
                v === NO_TRACKING_TEAM ? null : v
              );
            }}
          >
            <option value={NO_TRACKING_TEAM}>None</option>
            {trackingId &&
            !eligibleTrackingTeams.some((t) => t.id === trackingId) ? (
              <option value={trackingId}>
                {trackingLabel} (in this matchup)
              </option>
            ) : null}
            {eligibleTrackingTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {managePublished && published?.firestoreId ? (
        <div className="mt-2 flex min-w-0 flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || busy}
            title={editBlockers.length ? editBlockers.join("; ") : "Edit teams, court, and time"}
            onClick={() => onEditPublished?.(published)}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            title="Force release tracker locks for this match"
            onClick={() => onReleaseLocks?.(published)}
          >
            Release locks
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canDelete || busy}
            title={deleteBlockers.length ? deleteBlockers.join("; ") : "Remove from schedule"}
            onClick={() => onDeletePublished?.(published)}
          >
            {busy ? "…" : "Delete"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RoundColumnView({
  column,
  highlightedIds,
  onActivate,
  publishedByBracketId,
  feederStructure,
  selectionEnabled,
  selectedMatchIds,
  onToggleMatch,
  showMatchId,
  showBracketCode,
  managePublished,
  onEditPublished,
  onDeletePublished,
  onReleaseLocks,
  busyFirestoreId,
  reseedChecked,
  reseedLocked,
  onToggleReseed,
  teamColors,
  championTeamId,
  battleStyle,
  enableStatTrackingTeams,
  trackingTeams,
  onTrackingTeamChange,
  savingTrackingMatchId,
}: {
  column: RoundColumn;
  highlightedIds?: Set<string>;
  onActivate?: (id: string | null) => void;
  publishedByBracketId?: Map<string, PublishedPlayoffMatchInfo>;
  feederStructure: PlayoffBracketStructure;
  selectionEnabled?: boolean;
  selectedMatchIds?: Set<string>;
  onToggleMatch?: (id: string, checked: boolean) => void;
  showMatchId?: boolean;
  showBracketCode?: boolean;
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  onReleaseLocks?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  reseedChecked?: boolean;
  reseedLocked?: boolean;
  onToggleReseed?: (roundKey: string, checked: boolean) => void;
  teamColors?: Record<string, string | null | undefined>;
  championTeamId?: string | null;
  battleStyle?: boolean;
  enableStatTrackingTeams?: boolean;
  trackingTeams?: PlayoffTrackingTeamOption[];
  onTrackingTeamChange?: (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => void;
  savingTrackingMatchId?: string | null;
}) {
  const showReseed =
    !!onToggleReseed && isRoundConcrete(column.matches) && column.matches.length > 0;
  const roundPublished = column.matches.some((m) => publishedByBracketId?.has(m.id));
  const reseedDisabled = !!reseedLocked || roundPublished;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 shrink-0 rounded-xl p-2.5 border border-transparent",
        battleStyle ? "relative min-w-[16.5rem] pt-7" : "w-[14rem] min-w-[14rem] max-w-[14rem]",
        column.rail === "winners" &&
          "bg-sky-50/80 border-sky-200/60 dark:bg-sky-950/55 dark:border-sky-500/35",
        column.rail === "losers" &&
          "bg-amber-50/80 border-amber-200/60 dark:bg-amber-950/50 dark:border-amber-500/35",
        column.rail === "final" &&
          "bg-emerald-50/90 border-emerald-300/70 ring-1 ring-emerald-500/20 dark:bg-emerald-950/55 dark:border-emerald-400/45 dark:ring-emerald-400/30"
      )}
    >
      {battleStyle ? (
        <span
          className={cn(
            "absolute -top-2.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide shadow-sm",
            column.rail === "winners" &&
              "border-sky-300/80 bg-sky-100 text-sky-900 dark:border-sky-500/50 dark:bg-sky-950 dark:text-sky-100",
            column.rail === "losers" &&
              "border-amber-300/80 bg-amber-100 text-amber-950 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100",
            column.rail === "final" &&
              "border-emerald-400/80 bg-emerald-100 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-950 dark:text-emerald-100"
          )}
        >
          {column.title}
        </span>
      ) : (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-center tracking-wide dark:text-slate-100">
            {column.title}
          </div>
          {showReseed ? (
            <label
              className={cn(
                "flex items-center justify-center gap-1.5 text-[10px] font-medium",
                reseedDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                className={selectCheckboxClass}
                checked={!!reseedChecked}
                disabled={reseedDisabled}
                onCheckedChange={(v) => onToggleReseed?.(column.key, v === true)}
                aria-label={`Reseed ${column.title}`}
              />
              Reseed
            </label>
          ) : null}
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col justify-around", battleStyle ? "gap-5" : "gap-4")}>
        {column.matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            highlighted={highlightedIds?.has(m.id)}
            onActivate={onActivate}
            published={publishedByBracketId?.get(m.id)}
            feederStructure={feederStructure}
            selectable={
              !!selectionEnabled && isSlotReady(m) && !publishedByBracketId?.has(m.id)
            }
            selected={selectedMatchIds?.has(m.id)}
            onToggleSelect={onToggleMatch}
            showMatchId={showMatchId}
            showBracketCode={showBracketCode}
            managePublished={managePublished}
            onEditPublished={onEditPublished}
            onDeletePublished={onDeletePublished}
            onReleaseLocks={onReleaseLocks}
            busyFirestoreId={busyFirestoreId}
            teamColors={teamColors}
            championTeamId={championTeamId}
            isFinalRail={column.rail === "final"}
            battleStyle={battleStyle}
            enableStatTrackingTeams={enableStatTrackingTeams}
            trackingTeams={trackingTeams}
            onTrackingTeamChange={onTrackingTeamChange}
            savingTrackingMatchId={savingTrackingMatchId}
          />
        ))}
      </div>
    </div>
  );
}

function BracketRailScroller({
  title,
  titleClassName,
  columns,
  highlightedIds,
  onActivate,
  publishedByBracketId,
  feederStructure,
  selectionEnabled,
  selectedMatchIds,
  onToggleMatch,
  showMatchId,
  showBracketCode,
  managePublished,
  onEditPublished,
  onDeletePublished,
  onReleaseLocks,
  busyFirestoreId,
  reseedKeySet,
  reseedLocked,
  onToggleReseedRound,
  teamColors,
  championTeamId,
  battleStyle,
  enableStatTrackingTeams,
  trackingTeams,
  onTrackingTeamChange,
  savingTrackingMatchId,
}: {
  title: string;
  titleClassName: string;
  columns: RoundColumn[];
  highlightedIds: Set<string>;
  onActivate?: (id: string | null) => void;
  publishedByBracketId: Map<string, PublishedPlayoffMatchInfo>;
  feederStructure: PlayoffBracketStructure;
  selectionEnabled?: boolean;
  selectedMatchIds: Set<string>;
  onToggleMatch: (id: string, checked: boolean) => void;
  showMatchId?: boolean;
  showBracketCode?: boolean;
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  onReleaseLocks?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  reseedKeySet: Set<string>;
  reseedLocked?: boolean;
  onToggleReseedRound?: (roundKey: string, checked: boolean) => void;
  teamColors?: Record<string, string | null | undefined>;
  championTeamId?: string | null;
  battleStyle?: boolean;
  enableStatTrackingTeams?: boolean;
  trackingTeams?: PlayoffTrackingTeamOption[];
  onTrackingTeamChange?: (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => void;
  savingTrackingMatchId?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState, columns]);

  const scrollByDir = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * (battleStyle ? 280 : 240), behavior: "smooth" });
  };

  return (
    <div>
      <div className={cn("text-xs font-semibold mb-2 tracking-wide", titleClassName)}>{title}</div>
      <div className="relative">
        {canLeft ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 z-10 size-9 -translate-y-1/2 rounded-full bg-background/95 shadow-md dark:border-slate-500 dark:bg-slate-900/95"
            onClick={() => scrollByDir(-1)}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft className="size-4" />
          </Button>
        ) : null}
        {canRight ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 z-10 size-9 -translate-y-1/2 rounded-full bg-background/95 shadow-md dark:border-slate-500 dark:bg-slate-900/95"
            onClick={() => scrollByDir(1)}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight className="size-4" />
          </Button>
        ) : null}
        <div
          ref={scrollerRef}
          className={cn(
            "overflow-x-auto pb-2 scroll-smooth",
            battleStyle && "pt-3"
          )}
          onScroll={updateScrollState}
        >
          <div className="flex gap-0 items-stretch min-w-min px-1">
            {columns.map((col, i) => (
              <div key={col.key} className="flex items-stretch">
                {i > 0 ? (
                  <ColumnConnectors
                    leftMatches={columns[i - 1].matches}
                    rightMatches={col.matches}
                  />
                ) : null}
                <RoundColumnView
                  column={col}
                  highlightedIds={highlightedIds}
                  onActivate={onActivate}
                  publishedByBracketId={publishedByBracketId}
                  feederStructure={feederStructure}
                  selectionEnabled={selectionEnabled}
                  selectedMatchIds={selectedMatchIds}
                  onToggleMatch={onToggleMatch}
                  showMatchId={showMatchId}
                  showBracketCode={showBracketCode}
                  managePublished={managePublished}
                  onEditPublished={onEditPublished}
                  onDeletePublished={onDeletePublished}
                  onReleaseLocks={onReleaseLocks}
                  busyFirestoreId={busyFirestoreId}
                  reseedChecked={reseedKeySet.has(col.key)}
                  reseedLocked={reseedLocked}
                  onToggleReseed={onToggleReseedRound}
                  teamColors={teamColors}
                  championTeamId={championTeamId}
                  battleStyle={battleStyle}
                  enableStatTrackingTeams={enableStatTrackingTeams}
                  trackingTeams={trackingTeams}
                  onTrackingTeamChange={onTrackingTeamChange}
                  savingTrackingMatchId={savingTrackingMatchId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type PlayoffBracketViewProps = {
  structure: PlayoffBracketStructure;
  /**
   * Template structure with winner/loser placeholders for destination lookup.
   * Defaults to `structure` when omitted.
   */
  feederStructure?: PlayoffBracketStructure;
  publishedMatches?: PublishedPlayoffMatchInfo[];
  /** Enable hover highlights (admin). */
  interactiveHighlights?: boolean;
  /** Show publish-selection checkboxes on matches with known teams. */
  selectionEnabled?: boolean;
  selectedMatchIds?: string[];
  onSelectedMatchIdsChange?: (ids: string[]) => void;
  hint?: string;
  /** Admin: show Firestore MatchID on published cards. */
  showMatchId?: boolean;
  /** Show internal bracket codes (P1, W1-1). Default true for admin. */
  showBracketCode?: boolean;
  /** Admin: Edit/Delete controls on published cards. */
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  /** Admin: force-release tracker locks for a published match. */
  onReleaseLocks?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  /** Round keys currently marked for seed reshuffle. */
  reseedRoundKeys?: string[];
  /** Disable reseed toggles (e.g. after matches published). */
  reseedLocked?: boolean;
  onToggleReseedRound?: (roundKey: string, checked: boolean) => void;
  /** teamId → color for ColorBadge. */
  teamColors?: Record<string, string | null | undefined>;
  /** Persisted or derived champion for crown treatment on the final. */
  championTeamId?: string | null;
  /** Public: large schedule-style battle matchup cards. */
  battleStyle?: boolean;
  /** Admin: show Stats team select on published matches. */
  enableStatTrackingTeams?: boolean;
  /** Teams available for name lookup / Stats select. */
  trackingTeams?: PlayoffTrackingTeamOption[];
  onTrackingTeamChange?: (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => void;
  savingTrackingMatchId?: string | null;
};

export function PlayoffBracketView({
  structure,
  feederStructure,
  publishedMatches = [],
  interactiveHighlights = true,
  selectionEnabled = false,
  selectedMatchIds = [],
  onSelectedMatchIdsChange,
  hint,
  showMatchId = false,
  showBracketCode = true,
  managePublished = false,
  onEditPublished,
  onDeletePublished,
  onReleaseLocks,
  busyFirestoreId = null,
  reseedRoundKeys = [],
  reseedLocked = false,
  onToggleReseedRound,
  teamColors,
  championTeamId = null,
  battleStyle = false,
  enableStatTrackingTeams = false,
  trackingTeams,
  onTrackingTeamChange,
  savingTrackingMatchId = null,
}: PlayoffBracketViewProps) {
  const destinationStructure = feederStructure ?? structure;
  const reseedKeySet = useMemo(() => new Set(reseedRoundKeys), [reseedRoundKeys]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const highlightedIds = useMemo(
    () =>
      interactiveHighlights
        ? relatedMatchIds(destinationStructure, activeId)
        : new Set<string>(),
    [destinationStructure, activeId, interactiveHighlights]
  );

  const publishedByBracketId = useMemo(() => {
    const map = new Map<string, PublishedPlayoffMatchInfo>();
    for (const p of publishedMatches) map.set(p.bracketMatchId, p);
    return map;
  }, [publishedMatches]);

  const selectedMatchSet = useMemo(() => new Set(selectedMatchIds), [selectedMatchIds]);

  const winners = buildWinnersColumns(structure);
  const losers = buildLosersColumns(structure);

  const toggleMatch = (id: string, checked: boolean) => {
    const next = new Set(selectedMatchSet);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedMatchIdsChange?.([...next]);
  };

  const railProps = {
    highlightedIds,
    onActivate: interactiveHighlights ? setActiveId : undefined,
    publishedByBracketId,
    feederStructure: destinationStructure,
    selectionEnabled,
    selectedMatchIds: selectedMatchSet,
    onToggleMatch: toggleMatch,
    showMatchId,
    showBracketCode,
    managePublished,
    onEditPublished,
    onDeletePublished,
    onReleaseLocks,
    busyFirestoreId,
    reseedKeySet,
    reseedLocked,
    onToggleReseedRound,
    teamColors,
    championTeamId,
    battleStyle,
    enableStatTrackingTeams,
    trackingTeams,
    onTrackingTeamChange,
    savingTrackingMatchId,
  };

  return (
    <div className="space-y-6 pb-2">
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <BracketRailScroller
        title="Winners bracket"
        titleClassName="text-sky-800 dark:text-sky-200"
        columns={winners}
        {...railProps}
      />
      {losers.length > 0 ? (
        <BracketRailScroller
          title="Losers bracket"
          titleClassName="text-amber-800 dark:text-amber-200"
          columns={losers}
          {...railProps}
        />
      ) : null}
    </div>
  );
}
