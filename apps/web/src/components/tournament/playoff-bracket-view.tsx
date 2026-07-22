"use client";

import { useMemo, useState } from "react";
import {
  FINAL_ROUND_KEY,
  PLAY_INS_ROUND_KEY,
  findRoundKeyForMatchId,
  formatBracketSlotRef,
  getMatchDeleteBlockers,
  getMatchesForRoundKey,
  isSlotReady,
  losersRoundKey,
  winnersRoundKey,
  type BracketMatch,
  type BracketSlotRef,
  type PlayoffBracketStructure,
} from "@bsc/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
  activeLockCount?: number;
};

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

/** Edit court/time: allow COMPLETED; block IN_PROGRESS and locks only. */
export function getPublishedMatchEditBlockers(info: PublishedPlayoffMatchInfo): string[] {
  return getMatchDeleteBlockers(
    {
      status: info.status,
      // Omit PLAYOFF phase so COMPLETED remains editable for court/time.
      playSeq: info.playSeq,
      startedAt: info.startedAt,
      completedAt: info.completedAt,
      lastPlayAt: info.lastPlayAt,
      winnerTeamId: info.winnerTeamId,
    },
    { activeLockCount: info.activeLockCount ?? 0 }
  );
}

/** @deprecated Prefer getPublishedMatchDeleteBlockers / getPublishedMatchEditBlockers */
export function getPublishedMatchBlockers(info: PublishedPlayoffMatchInfo): string[] {
  return getPublishedMatchDeleteBlockers(info);
}

/** Larger, higher-contrast checkbox for publish selection. */
const selectCheckboxClass =
  "size-5 border-2 border-teal-700 bg-white shadow-sm data-[state=checked]:bg-teal-700 data-[state=checked]:border-teal-700 data-[state=checked]:text-white dark:border-teal-400 dark:bg-background dark:data-[state=checked]:bg-teal-500 dark:data-[state=checked]:border-teal-500";

function MatchCard({
  match,
  highlighted,
  onActivate,
  published,
  selectable,
  selected,
  onToggleSelect,
  showMatchId,
  managePublished,
  onEditPublished,
  onDeletePublished,
  busyFirestoreId,
}: {
  match: BracketMatch;
  highlighted?: boolean;
  onActivate?: (id: string | null) => void;
  published?: PublishedPlayoffMatchInfo;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, checked: boolean) => void;
  showMatchId?: boolean;
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
}) {
  const meta = formatCourtTime(published);
  const deleteBlockers = published ? getPublishedMatchDeleteBlockers(published) : [];
  const editBlockers = published ? getPublishedMatchEditBlockers(published) : [];
  const canEdit = !!published?.firestoreId && editBlockers.length === 0;
  const canDelete = !!published?.firestoreId && deleteBlockers.length === 0;
  const busy = published?.firestoreId != null && busyFirestoreId === published.firestoreId;

  return (
    <div
      className={cn(
        "rounded-md border bg-background px-2.5 py-2 text-sm shadow-sm transition-colors min-w-[11rem]",
        highlighted && "border-teal-600 ring-2 ring-teal-500/40 bg-teal-50 dark:bg-teal-950/40",
        onActivate && "cursor-pointer hover:border-teal-500/60",
        selected && "border-teal-600 ring-1 ring-teal-600/30"
      )}
      onMouseEnter={onActivate ? () => onActivate(match.id) : undefined}
      onMouseLeave={onActivate ? () => onActivate(null) : undefined}
      onFocus={onActivate ? () => onActivate(match.id) : undefined}
      onBlur={onActivate ? () => onActivate(null) : undefined}
      tabIndex={onActivate ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">
          {match.id}
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
        <div className="text-[10px] text-muted-foreground mb-1">
          MatchID: <span className="font-mono">{published.firestoreId}</span>
        </div>
      ) : null}
      <div className="font-medium leading-snug truncate" title={formatBracketSlotRef(match.teamA)}>
        {formatBracketSlotRef(match.teamA)}
      </div>
      <div className="text-[10px] text-muted-foreground my-0.5">vs</div>
      <div className="font-medium leading-snug truncate" title={formatBracketSlotRef(match.teamB)}>
        {formatBracketSlotRef(match.teamB)}
      </div>
      {meta ? (
        <div className="mt-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          {meta}
        </div>
      ) : published ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground">Published</div>
      ) : null}
      {managePublished && published?.firestoreId ? (
        <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!canEdit || busy}
            title={editBlockers.length ? editBlockers.join("; ") : "Edit court and time"}
            onClick={() => onEditPublished?.(published)}
          >
            Edit
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
  selectionEnabled,
  selectedMatchIds,
  onToggleMatch,
  showMatchId,
  managePublished,
  onEditPublished,
  onDeletePublished,
  busyFirestoreId,
}: {
  column: RoundColumn;
  highlightedIds?: Set<string>;
  onActivate?: (id: string | null) => void;
  publishedByBracketId?: Map<string, PublishedPlayoffMatchInfo>;
  selectionEnabled?: boolean;
  selectedMatchIds?: Set<string>;
  onToggleMatch?: (id: string, checked: boolean) => void;
  showMatchId?: boolean;
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 min-w-[12rem] shrink-0 rounded-lg p-2",
        column.rail === "winners" && "bg-sky-50/80 dark:bg-sky-950/20",
        column.rail === "losers" && "bg-amber-50/80 dark:bg-amber-950/20",
        column.rail === "final" && "bg-emerald-50/80 dark:bg-emerald-950/20"
      )}
    >
      <div className="text-xs font-semibold text-center">{column.title}</div>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {column.matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            highlighted={highlightedIds?.has(m.id)}
            onActivate={onActivate}
            published={publishedByBracketId?.get(m.id)}
            selectable={
              !!selectionEnabled && isSlotReady(m) && !publishedByBracketId?.has(m.id)
            }
            selected={selectedMatchIds?.has(m.id)}
            onToggleSelect={onToggleMatch}
            showMatchId={showMatchId}
            managePublished={managePublished}
            onEditPublished={onEditPublished}
            onDeletePublished={onDeletePublished}
            busyFirestoreId={busyFirestoreId}
          />
        ))}
      </div>
    </div>
  );
}

export type PlayoffBracketViewProps = {
  structure: PlayoffBracketStructure;
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
  /** Admin: Edit/Delete controls on published cards. */
  managePublished?: boolean;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
};

export function PlayoffBracketView({
  structure,
  publishedMatches = [],
  interactiveHighlights = true,
  selectionEnabled = false,
  selectedMatchIds = [],
  onSelectedMatchIdsChange,
  hint,
  showMatchId = false,
  managePublished = false,
  onEditPublished,
  onDeletePublished,
  busyFirestoreId = null,
}: PlayoffBracketViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const highlightedIds = useMemo(
    () => (interactiveHighlights ? relatedMatchIds(structure, activeId) : new Set<string>()),
    [structure, activeId, interactiveHighlights]
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

  return (
    <div className="space-y-4 overflow-x-auto pb-2">
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <div>
        <div className="text-xs font-medium text-sky-800 dark:text-sky-300 mb-2">Winners bracket</div>
        <div className="flex gap-3 items-stretch min-w-min">
          {winners.map((col, i) => (
            <div key={col.key} className="flex items-stretch gap-3">
              {i > 0 ? (
                <div className="w-4 self-stretch flex items-center shrink-0" aria-hidden>
                  <div className="h-px w-full bg-border" />
                </div>
              ) : null}
              <RoundColumnView
                column={col}
                highlightedIds={highlightedIds}
                onActivate={interactiveHighlights ? setActiveId : undefined}
                publishedByBracketId={publishedByBracketId}
                selectionEnabled={selectionEnabled}
                selectedMatchIds={selectedMatchSet}
                onToggleMatch={toggleMatch}
                showMatchId={showMatchId}
                managePublished={managePublished}
                onEditPublished={onEditPublished}
                onDeletePublished={onDeletePublished}
                busyFirestoreId={busyFirestoreId}
              />
            </div>
          ))}
        </div>
      </div>
      {losers.length > 0 ? (
        <div>
          <div className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-2">
            Losers bracket
          </div>
          <div className="flex gap-3 items-stretch min-w-min">
            {losers.map((col, i) => (
              <div key={col.key} className="flex items-stretch gap-3">
                {i > 0 ? (
                  <div className="w-4 self-stretch flex items-center shrink-0" aria-hidden>
                    <div className="h-px w-full bg-border" />
                  </div>
                ) : null}
                <RoundColumnView
                  column={col}
                  highlightedIds={highlightedIds}
                  onActivate={interactiveHighlights ? setActiveId : undefined}
                  publishedByBracketId={publishedByBracketId}
                  selectionEnabled={selectionEnabled}
                  selectedMatchIds={selectedMatchSet}
                  onToggleMatch={toggleMatch}
                  showMatchId={showMatchId}
                  managePublished={managePublished}
                  onEditPublished={onEditPublished}
                  onDeletePublished={onDeletePublished}
                  busyFirestoreId={busyFirestoreId}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
