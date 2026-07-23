"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from "firebase/firestore";
import { formatSetScores, type TrackerStat } from "@bsc/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase/client";
import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

export type ScheduleMatch = {
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
  courtNumber?: number;
  pairingType?: "DIVISION" | "CROSS";
  divisionId?: string | null;
};

export type ScheduleTeam = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};

export type ScheduleDivision = {
  id: string;
  name: string;
  color?: string | null;
};

type MatchPlay = {
  id: string;
  seq: number;
  teamKey: "A" | "B";
  setNumber: number;
  deleted?: boolean;
  entries: { playerId: string | null; statKey: string }[];
};

export type SchedulePlayer = {
  id: string;
  displayName?: string | null;
};

function useMatchPlays(
  tournamentId: string | undefined,
  matchId: string | null
): { plays: MatchPlay[]; loading: boolean } {
  const [plays, setPlays] = useState<MatchPlay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db || !tournamentId || !matchId) {
      setPlays([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPlays([]);
    const playsRef = collection(db, "tournaments", tournamentId, "matches", matchId, "plays");
    const q = query(playsRef, orderBy("seq", "asc"));
    const unsub: Unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: MatchPlay[] = snap.docs
          .map((d) => {
            const data = d.data();
            const rawEntries = Array.isArray(data.entries) ? data.entries : [];
            return {
              id: d.id,
              seq: typeof data.seq === "number" ? data.seq : 0,
              teamKey: (data.teamKey === "B" ? "B" : "A") as "A" | "B",
              setNumber: typeof data.setNumber === "number" ? data.setNumber : 1,
              deleted: data.deleted === true,
              entries: rawEntries.map((e: { playerId?: string | null; statKey?: string }) => ({
                playerId: e?.playerId ?? null,
                statKey: typeof e?.statKey === "string" ? e.statKey : "",
              })),
            };
          })
          .filter((p) => !p.deleted);
        setPlays(next);
        setLoading(false);
      },
      () => {
        setPlays([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [tournamentId, matchId]);

  return { plays, loading };
}

function setNumbersForMatch(match: ScheduleMatch, plays: MatchPlay[]): number[] {
  const fromScores = Array.isArray(match.setScores) ? match.setScores.length : 0;
  let maxPlaySet = 0;
  for (const play of plays) {
    if (play.setNumber > maxPlaySet) maxPlaySet = play.setNumber;
  }
  const total = Math.max(fromScores, maxPlaySet);
  if (total === 0) return [];
  return Array.from({ length: total }, (_, i) => i + 1);
}

function playsForSetTeam(
  plays: MatchPlay[],
  setNumber: number,
  teamKey: "A" | "B"
): MatchPlay[] {
  return plays.filter((p) => p.setNumber === setNumber && p.teamKey === teamKey);
}

function formatPlayEntryLine(
  entry: { playerId: string | null; statKey: string },
  playerName: (id: string | null) => string,
  statLabel: (key: string) => string
): string {
  const stat = statLabel(entry.statKey);
  const player = entry.playerId ? playerName(entry.playerId) : null;
  if (player) return `${stat} · ${player}`;
  return stat;
}

const RECENT_PLAY_LIMIT = 6;
/** Fetch extra so a new set still has enough current-set plays after filtering. */
const RECENT_PLAY_FETCH_LIMIT = 40;

type RecentPlay = {
  id: string;
  seq: number;
  teamKey: "A" | "B";
  setNumber?: number;
  deleted?: boolean;
  entries: { playerId: string | null; statKey: string }[];
};

function useRecentPlaysByMatch(
  tournamentId: string | undefined,
  matchIds: string[]
): Map<string, RecentPlay[]> {
  const [byMatch, setByMatch] = useState<Map<string, RecentPlay[]>>(() => new Map());
  const idsKey = matchIds.slice().sort().join(",");

  useEffect(() => {
    if (!db || !tournamentId || matchIds.length === 0) {
      setByMatch(new Map());
      return;
    }

    const unsubs: Unsubscribe[] = [];
    const next = new Map<string, RecentPlay[]>();

    for (const matchId of matchIds) {
      const playsRef = collection(db, "tournaments", tournamentId, "matches", matchId, "plays");
      const q = query(playsRef, orderBy("seq", "desc"), limit(RECENT_PLAY_FETCH_LIMIT));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const plays: RecentPlay[] = snap.docs
            .map((d): RecentPlay => {
              const data = d.data();
              const rawEntries = Array.isArray(data.entries) ? data.entries : [];
              return {
                id: d.id,
                seq: typeof data.seq === "number" ? data.seq : 0,
                teamKey: data.teamKey === "B" ? "B" : "A",
                setNumber: typeof data.setNumber === "number" ? data.setNumber : undefined,
                deleted: data.deleted === true,
                entries: rawEntries.map((e: { playerId?: string | null; statKey?: string }) => ({
                  playerId: e?.playerId ?? null,
                  statKey: typeof e?.statKey === "string" ? e.statKey : "",
                })),
              };
            })
            .filter((p) => !p.deleted);

          setByMatch((prev) => {
            const updated = new Map(prev);
            updated.set(matchId, plays);
            return updated;
          });
        },
        () => {
          setByMatch((prev) => {
            const updated = new Map(prev);
            updated.set(matchId, []);
            return updated;
          });
        }
      );
      unsubs.push(unsub);
      next.set(matchId, []);
    }

    setByMatch(next);
    return () => unsubs.forEach((u) => u());
    // idsKey captures matchIds membership without depending on array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, idsKey]);

  return byMatch;
}

function formatRecentPlayLine(
  play: RecentPlay,
  playerName: (id: string | null) => string,
  statLabel: (key: string) => string,
  teamLabel: string
): string {
  const entry = play.entries[0];
  const team = teamLabel || `Team ${play.teamKey}`;
  const playLabel = entry?.statKey ? statLabel(entry.statKey) : "Point";
  const player = entry?.playerId ? playerName(entry.playerId) : "—";
  return `#${play.seq} · ${playLabel} · ${player} · ${team}`;
}

function recentPlayParts(
  play: RecentPlay,
  playerName: (id: string | null) => string,
  statLabel: (key: string) => string,
  teamLabel: string
): { seq: number; play: string; player: string; team: string } {
  const entry = play.entries[0];
  return {
    seq: play.seq,
    play: entry?.statKey ? statLabel(entry.statKey) : "Point",
    player: entry?.playerId ? playerName(entry.playerId) : "—",
    team: teamLabel || `Team ${play.teamKey}`,
  };
}

const DEFAULT_TEAM_COLOR = "#1a3556";
const ALL_SLOTS = "all";
const ALL_TEAMS = "all";
const ALL_COURTS = "all";
const NO_COURT_KEY = "none";

type ScheduleViewMode = "slots" | "teams" | "courts";

function courtKey(match: ScheduleMatch): string {
  return match.courtNumber != null ? String(match.courtNumber) : NO_COURT_KEY;
}

function courtLabel(key: string): string {
  return key === NO_COURT_KEY ? "No court" : `Court ${key}`;
}

function sortMatchesByTimeThenStatus(list: ScheduleMatch[]): ScheduleMatch[] {
  const statusRank = (s: ScheduleMatch["status"]) =>
    s === "IN_PROGRESS" ? 0 : s === "UPCOMING" ? 1 : 2;
  return [...list].sort((a, b) => {
    const sa = matchSeconds(a);
    const sb = matchSeconds(b);
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa == null && sb != null) return 1;
    if (sa != null && sb == null) return -1;
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) return rank;
    return (a.courtNumber ?? 999) - (b.courtNumber ?? 999);
  });
}

function matchSeconds(m: ScheduleMatch): number | null {
  const s = m.scheduledAt?.seconds;
  return typeof s === "number" ? s : null;
}

/** Floor to the minute for slot grouping. */
function slotKey(seconds: number | null): string {
  if (seconds == null) return "unscheduled";
  return String(Math.floor(seconds / 60) * 60);
}

function formatSlotLabel(seconds: number | null): string {
  if (seconds == null) return "Unscheduled";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFilterLabel(seconds: number | null): string {
  if (seconds == null) return "Unscheduled";
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMatchTime(match: ScheduleMatch): string | null {
  const seconds = matchSeconds(match);
  if (seconds == null) return null;
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

type SlotGroup = {
  key: string;
  seconds: number | null;
  label: string;
  filterLabel: string;
  matches: ScheduleMatch[];
};

function groupMatchesBySlot(
  matches: ScheduleMatch[],
  teamName: (id: string) => string
): SlotGroup[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const key = slotKey(matchSeconds(m));
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }

  const groups: SlotGroup[] = [];
  for (const [key, slotMatches] of map) {
    const seconds = key === "unscheduled" ? null : Number(key);
    const statusRank = (s: ScheduleMatch["status"]) =>
      s === "IN_PROGRESS" ? 0 : s === "UPCOMING" ? 1 : 2;
    const sorted = [...slotMatches].sort((a, b) => {
      const rank = statusRank(a.status) - statusRank(b.status);
      if (rank !== 0) return rank;
      const courtA = a.courtNumber ?? 999;
      const courtB = b.courtNumber ?? 999;
      if (courtA !== courtB) return courtA - courtB;
      return (
        teamName(a.teamAId).localeCompare(teamName(b.teamAId)) ||
        teamName(a.teamBId).localeCompare(teamName(b.teamBId))
      );
    });
    groups.push({
      key,
      seconds,
      label: formatSlotLabel(seconds),
      filterLabel: formatFilterLabel(seconds),
      matches: sorted,
    });
  }

  return groups.sort((a, b) => {
    if (a.seconds == null && b.seconds == null) return 0;
    if (a.seconds == null) return 1;
    if (b.seconds == null) return -1;
    return a.seconds - b.seconds;
  });
}

function DivisionRail({
  label,
  colorA,
  colorB,
  isCross,
}: {
  label: string | null;
  colorA?: string | null;
  colorB?: string | null;
  isCross: boolean;
}) {
  const railText = label ? (
    <span className="[writing-mode:vertical-rl] rotate-180 max-h-full truncate py-2 text-sm font-bold uppercase tracking-wider sm:text-base">
      {label}
    </span>
  ) : null;

  if (isCross && colorA && colorB && colorA !== colorB) {
    return (
      <div
        className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl sm:w-9"
        style={{
          background: `linear-gradient(180deg, ${colorA} 0%, ${colorA} 50%, ${colorB} 50%, ${colorB} 100%)`,
          color: readableTextColor(colorA),
        }}
      >
        {railText}
      </div>
    );
  }
  if (isCross && (!colorA || !colorB)) {
    return (
      <div className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl border-r border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground sm:w-9">
        {railText}
      </div>
    );
  }
  const color = colorA ?? colorB ?? "#94a3b8";
  return (
    <div
      className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl sm:w-9"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {railText}
    </div>
  );
}

function TeamBlock({
  name,
  color,
  isWinner,
  isLoser,
  setsWon,
  showSetsWon,
  scoreAlign,
}: {
  name: string;
  color?: string | null;
  isWinner?: boolean;
  isLoser?: boolean;
  setsWon?: number;
  showSetsWon?: boolean;
  /** Where the set score sits inside the pill (toward the center VS). Only used when showSetsWon. */
  scoreAlign?: "start" | "end";
}) {
  const bg = color || DEFAULT_TEAM_COLOR;
  const withScore = !!showSetsWon;
  const score = withScore ? (
    <div className="shrink-0 text-2xl font-black tabular-nums leading-none sm:text-3xl md:text-4xl">
      {setsWon ?? 0}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 items-center rounded-xl px-4 py-4 sm:px-5 sm:py-5 transition-opacity",
        withScore ? "gap-3" : "gap-0",
        isLoser && "opacity-55",
        isWinner && "outline outline-2 outline-black outline-offset-1 dark:outline-white"
      )}
      style={{
        backgroundColor: bg,
        color: readableTextColor(bg),
      }}
    >
      {withScore && scoreAlign === "start" ? score : null}
      <div
        className={cn(
          "min-w-0 flex-1 text-xl font-extrabold leading-tight sm:text-2xl md:text-3xl truncate text-left",
          withScore && scoreAlign === "start" && "text-right"
        )}
      >
        {name}
      </div>
      {withScore && scoreAlign === "end" ? score : null}
    </div>
  );
}

function SetScoreRow({
  setScores,
  highlightIndex,
}: {
  setScores?: { a: number; b: number }[] | null;
  highlightIndex?: number | null;
}) {
  if (!Array.isArray(setScores) || setScores.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {setScores.map((s, i) => {
        const active = highlightIndex != null && i === highlightIndex;
        return (
          <span
            key={i}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm font-bold tabular-nums sm:text-base",
              active
                ? "border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "border-border bg-muted/40 text-foreground"
            )}
            title={`Set ${i + 1}`}
          >
            {s?.a ?? 0}–{s?.b ?? 0}
          </span>
        );
      })}
    </div>
  );
}

function FightCard({
  match,
  teamName,
  teamColor,
  teamDivisionId,
  divisionById,
  onOpenDetails,
  recentPlays,
  playerName,
  statLabel,
}: {
  match: ScheduleMatch;
  teamName: (id?: string | null) => string;
  teamColor: (id?: string | null) => string | null;
  teamDivisionId: (id?: string | null) => string | null;
  divisionById: Map<string, ScheduleDivision>;
  onOpenDetails?: (match: ScheduleMatch) => void;
  recentPlays?: RecentPlay[];
  playerName?: (id: string | null) => string;
  statLabel?: (key: string) => string;
}) {
  const isCross = match.pairingType === "CROSS";
  const isCompleted = match.status === "COMPLETED";
  const isLive = match.status === "IN_PROGRESS";
  const winnerId = match.winnerTeamId ?? null;
  const aWins = isCompleted && winnerId === match.teamAId;
  const bWins = isCompleted && winnerId === match.teamBId;
  const clickable = isCompleted && !!onOpenDetails;

  const divAId = teamDivisionId(match.teamAId);
  const divBId = teamDivisionId(match.teamBId);
  const matchDivision = match.divisionId ? divisionById.get(match.divisionId) : null;

  let railColorA: string | null | undefined;
  let railColorB: string | null | undefined;
  if (isCross) {
    railColorA = divAId ? divisionById.get(divAId)?.color : null;
    railColorB = divBId ? divisionById.get(divBId)?.color : null;
  } else {
    railColorA = matchDivision?.color ?? (divAId ? divisionById.get(divAId)?.color : null);
  }

  const divisionLabel = isCross ? "Cross" : matchDivision?.name ?? null;
  const currentSetIdx =
    isLive && match.currentSet != null ? Math.max(0, match.currentSet - 1) : null;
  const setLine = formatSetScores(match.setScores);
  const timeLabel = formatMatchTime(match);
  const metaParts = [
    match.courtNumber != null ? `Court ${match.courtNumber}` : null,
    timeLabel,
  ].filter(Boolean);
  const currentSetNumber = match.currentSet ?? 1;
  const visibleRecentPlays = isLive
    ? (recentPlays ?? [])
        .filter((p) => (p.setNumber ?? 1) === currentSetNumber)
        .slice(0, RECENT_PLAY_LIMIT)
    : [];

  const cardClassName = cn(
    "relative flex w-full rounded-xl border bg-card text-left transition-colors",
    isLive && "ring-2 ring-red-500/40",
    clickable &&
      "cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  );

  const body = (
    <>
      {metaParts.length > 0 && (
        <span className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-5 py-1 text-base font-bold text-background sm:text-lg">
          {metaParts.join(" · ")}
        </span>
      )}
      <DivisionRail
        label={divisionLabel}
        colorA={railColorA}
        colorB={railColorB}
        isCross={isCross}
      />
      <div className="min-w-0 flex-1 p-4 pt-7 sm:p-5 sm:pt-8 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
          <TeamBlock
            name={teamName(match.teamAId)}
            color={teamColor(match.teamAId)}
            isWinner={aWins}
            isLoser={isCompleted && !aWins && !!winnerId}
            showSetsWon={isLive || isCompleted}
            setsWon={match.scoreA ?? 0}
            scoreAlign="end"
          />
          <div className="flex flex-col items-center justify-center shrink-0 gap-1 px-1">
            <span className="text-sm font-extrabold tracking-widest text-muted-foreground sm:text-base">
              VS
            </span>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 sm:text-base">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                Live
              </span>
            ) : null}
          </div>
          <TeamBlock
            name={teamName(match.teamBId)}
            color={teamColor(match.teamBId)}
            isWinner={bWins}
            isLoser={isCompleted && !bWins && !!winnerId}
            showSetsWon={isLive || isCompleted}
            setsWon={match.scoreB ?? 0}
            scoreAlign="start"
          />
        </div>

        {(isLive || isCompleted) && (match.setScores?.length || setLine) ? (
          <div className="space-y-1.5">
            <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
              Set points
            </div>
            <SetScoreRow setScores={match.setScores} highlightIndex={currentSetIdx} />
          </div>
        ) : null}

        {isLive && playerName && statLabel ? (
          <div className="border-t pt-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
              Recent plays
              {match.currentSet != null ? ` · Set ${match.currentSet}` : null}
            </div>
            {visibleRecentPlays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Waiting for plays…</p>
            ) : (
              <ul className="space-y-1">
                {visibleRecentPlays.map((play) => {
                  const playTeamName =
                    play.teamKey === "B"
                      ? teamName(match.teamBId)
                      : teamName(match.teamAId);
                  const parts = recentPlayParts(
                    play,
                    playerName,
                    statLabel,
                    playTeamName
                  );
                  const line = formatRecentPlayLine(
                    play,
                    playerName,
                    statLabel,
                    playTeamName
                  );
                  return (
                    <li
                      key={play.id}
                      className="grid grid-cols-[2.5rem_minmax(0,0.55fr)_minmax(0,2.2fr)_minmax(0,0.85fr)] items-baseline gap-x-2 text-sm md:text-base text-foreground/90"
                      title={line}
                    >
                      <span className="font-bold tabular-nums text-muted-foreground">
                        #{parts.seq}
                      </span>
                      <span className="truncate font-medium">{parts.play}</span>
                      <span className="truncate">{parts.player}</span>
                      <span className="truncate text-muted-foreground">{parts.team}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className={cn(cardClassName, "font-inherit")}
        onClick={() => onOpenDetails?.(match)}
        aria-label={`View set scores and stats for ${teamName(match.teamAId)} vs ${teamName(match.teamBId)}`}
      >
        {body}
      </button>
    );
  }

  return <div className={cardClassName}>{body}</div>;
}

function TeamPlayLog({
  teamName,
  teamColor,
  plays,
  playerName,
  statLabel,
}: {
  teamName: string;
  teamColor: string;
  plays: MatchPlay[];
  playerName: (id: string | null) => string;
  statLabel: (key: string) => string;
}) {
  return (
    <div className="min-w-0 rounded-lg border overflow-hidden flex flex-col">
      <div
        className="px-3 py-2 text-sm font-bold truncate"
        style={{
          backgroundColor: teamColor,
          color: readableTextColor(teamColor),
        }}
        title={teamName}
      >
        {teamName}
      </div>
      {plays.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No plays recorded</p>
      ) : (
        <ul className="divide-y max-h-64 overflow-y-auto">
          {plays.map((play) => {
            const entries =
              play.entries.length > 0
                ? play.entries
                : [{ playerId: null, statKey: "" }];
            return entries.map((entry, entryIdx) => (
              <li
                key={`${play.id}-${entryIdx}`}
                className="flex items-baseline gap-2 px-3 py-2 text-sm leading-snug"
              >
                <span className="shrink-0 font-bold tabular-nums text-muted-foreground">
                  #{play.seq}
                </span>
                <span>
                  {entry.statKey
                    ? formatPlayEntryLine(entry, playerName, statLabel)
                    : "Point"}
                </span>
              </li>
            ));
          })}
        </ul>
      )}
    </div>
  );
}

function CompletedMatchDetailsDialog({
  match,
  open,
  onOpenChange,
  tournamentId,
  configStats,
  players,
  teamName,
  teamColor,
}: {
  match: ScheduleMatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId?: string;
  configStats: TrackerStat[];
  players: SchedulePlayer[];
  teamName: (id?: string | null) => string;
  teamColor: (id?: string | null) => string | null;
}) {
  const { plays, loading } = useMatchPlays(tournamentId, open && match ? match.id : null);

  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.displayName ?? p.id]));
    return (id: string | null) => (id ? map.get(id) ?? "Player" : "Player");
  }, [players]);

  const statLabel = useMemo(() => {
    const map = new Map(configStats.map((s) => [s.key, s.shortLabel || s.label || s.key]));
    return (key: string) => map.get(key) ?? key;
  }, [configStats]);

  const nameA = match ? teamName(match.teamAId) : "";
  const nameB = match ? teamName(match.teamBId) : "";
  const colorA = (match ? teamColor(match.teamAId) : null) || DEFAULT_TEAM_COLOR;
  const colorB = (match ? teamColor(match.teamBId) : null) || DEFAULT_TEAM_COLOR;
  const sets = match ? setNumbersForMatch(match, plays) : [];
  const hasAnyPlays = plays.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,880px)] overflow-y-auto sm:max-w-3xl">
        {match ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl sm:text-2xl">
                {nameA} vs {nameB}
              </DialogTitle>
              <DialogDescription>
                Set scores and plays recorded for each set.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <span
                className="inline-flex max-w-[45%] truncate rounded-lg px-3 py-1.5 text-sm font-bold sm:text-base"
                style={{ backgroundColor: colorA, color: readableTextColor(colorA) }}
              >
                {nameA}
              </span>
              <div className="text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
                {match.scoreA ?? 0}
                <span className="mx-1 text-muted-foreground">–</span>
                {match.scoreB ?? 0}
              </div>
              <span
                className="inline-flex max-w-[45%] truncate rounded-lg px-3 py-1.5 text-sm font-bold sm:text-base"
                style={{ backgroundColor: colorB, color: readableTextColor(colorB) }}
              >
                {nameB}
              </span>
            </div>

            {match.setScores?.length ? (
              <div className="space-y-1.5">
                <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Set points
                </div>
                <SetScoreRow setScores={match.setScores} />
              </div>
            ) : null}

            {loading ? (
              <p className="py-6 text-center text-muted-foreground">Loading plays…</p>
            ) : sets.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                No set scores or plays recorded for this match.
              </p>
            ) : (
              <div className="space-y-5">
                {sets.map((setNumber) => {
                  const score = match.setScores?.[setNumber - 1];
                  const playsA = playsForSetTeam(plays, setNumber, "A");
                  const playsB = playsForSetTeam(plays, setNumber, "B");

                  return (
                    <section key={setNumber} className="rounded-xl border bg-card/60 p-3 sm:p-4">
                      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg font-extrabold tracking-tight sm:text-xl">
                          Set {setNumber}
                        </h3>
                        {score ? (
                          <span className="rounded-md border bg-muted/40 px-2.5 py-1 text-sm font-bold tabular-nums">
                            {score.a}–{score.b}
                          </span>
                        ) : null}
                      </header>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <TeamPlayLog
                          teamName={nameA}
                          teamColor={colorA}
                          plays={playsA}
                          playerName={playerName}
                          statLabel={statLabel}
                        />
                        <TeamPlayLog
                          teamName={nameB}
                          teamColor={colorB}
                          plays={playsB}
                          playerName={playerName}
                          statLabel={statLabel}
                        />
                      </div>
                    </section>
                  );
                })}
                {!hasAnyPlays ? (
                  <p className="text-center text-sm text-muted-foreground">
                    No plays were recorded; set scores are shown above.
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PublicSchedule({
  matches,
  teams,
  divisions,
  tournamentId,
  configStats = [],
  players = [],
}: {
  matches: ScheduleMatch[];
  teams: ScheduleTeam[];
  divisions: ScheduleDivision[];
  tournamentId?: string;
  configStats?: TrackerStat[];
  players?: SchedulePlayer[];
}) {
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("slots");
  const [selectedSlot, setSelectedSlot] = useState<string>(ALL_SLOTS);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(ALL_TEAMS);
  const [selectedCourtKey, setSelectedCourtKey] = useState<string>(ALL_COURTS);
  const [detailMatch, setDetailMatch] = useState<ScheduleMatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openMatchDetails = (match: ScheduleMatch) => {
    setDetailMatch(match);
    setDetailsOpen(true);
  };

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.name]));
    return (id?: string | null) => (id ? map.get(id) ?? "Team" : "Team");
  }, [teams]);

  const teamColor = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.color ?? null]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [teams]);

  const teamDivisionId = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.divisionId ?? null]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [teams]);

  const divisionById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions]
  );

  const liveMatchIds = useMemo(
    () => matches.filter((m) => m.status === "IN_PROGRESS").map((m) => m.id),
    [matches]
  );
  const recentByMatch = useRecentPlaysByMatch(tournamentId, liveMatchIds);

  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.displayName ?? p.id]));
    return (id: string | null) => (id ? map.get(id) ?? "Player" : "Player");
  }, [players]);

  const statLabel = useMemo(() => {
    const map = new Map(configStats.map((s) => [s.key, s.shortLabel || s.label || s.key]));
    return (key: string) => map.get(key) ?? key;
  }, [configStats]);

  const slots = useMemo(
    () => groupMatchesBySlot(matches, (id) => teamName(id)),
    [matches, teamName]
  );

  const teamsWithMatches = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.teamAId) ids.add(m.teamAId);
      if (m.teamBId) ids.add(m.teamBId);
    }
    return [...teams]
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [matches, teams]);

  const matchesByTeam = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    for (const team of teamsWithMatches) {
      const list = matches.filter((m) => m.teamAId === team.id || m.teamBId === team.id);
      map.set(team.id, sortMatchesByTimeThenStatus(list));
    }
    return map;
  }, [matches, teamsWithMatches]);

  const courtsWithMatches = useMemo(() => {
    const keys = new Set<string>();
    for (const m of matches) keys.add(courtKey(m));
    return [...keys].sort((a, b) => {
      if (a === NO_COURT_KEY) return 1;
      if (b === NO_COURT_KEY) return -1;
      return Number(a) - Number(b);
    });
  }, [matches]);

  const matchesByCourt = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    for (const key of courtsWithMatches) {
      const list = matches.filter((m) => courtKey(m) === key);
      map.set(key, sortMatchesByTimeThenStatus(list));
    }
    return map;
  }, [matches, courtsWithMatches]);

  useEffect(() => {
    if (selectedSlot === ALL_SLOTS) return;
    if (!slots.some((s) => s.key === selectedSlot)) {
      setSelectedSlot(ALL_SLOTS);
    }
  }, [slots, selectedSlot]);

  useEffect(() => {
    if (selectedTeamId === ALL_TEAMS) return;
    if (!teamsWithMatches.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(ALL_TEAMS);
    }
  }, [teamsWithMatches, selectedTeamId]);

  useEffect(() => {
    if (selectedCourtKey === ALL_COURTS) return;
    if (!courtsWithMatches.includes(selectedCourtKey)) {
      setSelectedCourtKey(ALL_COURTS);
    }
  }, [courtsWithMatches, selectedCourtKey]);

  const visibleSlots = useMemo(() => {
    if (selectedSlot === ALL_SLOTS) return slots;
    return slots.filter((s) => s.key === selectedSlot);
  }, [slots, selectedSlot]);

  const visibleTeamSections = useMemo(() => {
    const list =
      selectedTeamId === ALL_TEAMS
        ? teamsWithMatches
        : teamsWithMatches.filter((t) => t.id === selectedTeamId);
    return list.map((team) => ({
      team,
      matches: matchesByTeam.get(team.id) ?? [],
    }));
  }, [teamsWithMatches, selectedTeamId, matchesByTeam]);

  const visibleCourtSections = useMemo(() => {
    const list =
      selectedCourtKey === ALL_COURTS
        ? courtsWithMatches
        : courtsWithMatches.filter((k) => k === selectedCourtKey);
    return list.map((key) => ({
      key,
      label: courtLabel(key),
      matches: matchesByCourt.get(key) ?? [],
    }));
  }, [courtsWithMatches, selectedCourtKey, matchesByCourt]);

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-lg text-muted-foreground text-center">
        Schedule will appear here once matches are created.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CompletedMatchDetailsDialog
        match={detailMatch}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        tournamentId={tournamentId}
        configStats={configStats}
        players={players}
        teamName={teamName}
        teamColor={teamColor}
      />

      <div
        className="inline-flex flex-wrap rounded-full border bg-card p-1"
        role="group"
        aria-label="Schedule view"
      >
        <button
          type="button"
          onClick={() => setViewMode("slots")}
          className={cn(
            "rounded-full px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
            viewMode === "slots"
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          By time
        </button>
        <button
          type="button"
          onClick={() => setViewMode("teams")}
          className={cn(
            "rounded-full px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
            viewMode === "teams"
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          Per team
        </button>
        <button
          type="button"
          onClick={() => setViewMode("courts")}
          className={cn(
            "rounded-full px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
            viewMode === "courts"
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          Per court
        </button>
      </div>

      {viewMode === "slots" ? (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter by time slot"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSlot === ALL_SLOTS}
              onClick={() => setSelectedSlot(ALL_SLOTS)}
              className={cn(
                "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                selectedSlot === ALL_SLOTS
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              )}
            >
              All
            </button>
            {slots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                role="tab"
                aria-selected={selectedSlot === slot.key}
                onClick={() => setSelectedSlot(slot.key)}
                className={cn(
                  "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                  selectedSlot === slot.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-muted/60"
                )}
              >
                {slot.filterLabel}
              </button>
            ))}
          </div>

          <div className="space-y-8">
            {visibleSlots.map((slot) => (
              <section key={slot.key} className="space-y-3">
                <header className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-sm bg-background/85">
                  <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {slot.label}
                  </h3>
                  <p className="text-base text-muted-foreground sm:text-lg">
                    {slot.matches.length} match{slot.matches.length === 1 ? "" : "es"}
                  </p>
                </header>
                <div className="grid gap-6 pt-2 lg:grid-cols-2">
                  {slot.matches.map((m) => (
                    <FightCard
                      key={m.id}
                      match={m}
                      teamName={teamName}
                      teamColor={teamColor}
                      teamDivisionId={teamDivisionId}
                      divisionById={divisionById}
                      onOpenDetails={openMatchDetails}
                      recentPlays={
                        m.status === "IN_PROGRESS"
                          ? recentByMatch.get(m.id) ?? []
                          : undefined
                      }
                      playerName={playerName}
                      statLabel={statLabel}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : viewMode === "teams" ? (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter by team"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedTeamId === ALL_TEAMS}
              onClick={() => setSelectedTeamId(ALL_TEAMS)}
              className={cn(
                "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                selectedTeamId === ALL_TEAMS
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              )}
            >
              All teams
            </button>
            {teamsWithMatches.map((team) => {
              const color = team.color?.trim() || DEFAULT_TEAM_COLOR;
              const selected = selectedTeamId === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                    selected
                      ? "border-transparent shadow-sm"
                      : "border-border bg-card text-foreground hover:bg-muted/60"
                  )}
                  style={
                    selected
                      ? {
                          backgroundColor: color,
                          color: readableTextColor(color),
                          borderColor: color,
                        }
                      : undefined
                  }
                >
                  {team.name}
                </button>
              );
            })}
          </div>

          <div className="space-y-10">
            {visibleTeamSections.map(({ team, matches: teamMatches }) => {
              const color = team.color?.trim() || DEFAULT_TEAM_COLOR;
              return (
                <section key={team.id} className="space-y-4">
                  <header className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-sm bg-background/85">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="inline-flex max-w-full items-center rounded-xl px-4 py-2 text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl"
                        style={{
                          backgroundColor: color,
                          color: readableTextColor(color),
                        }}
                      >
                        <span className="truncate">{team.name}</span>
                      </span>
                      <p className="text-base text-muted-foreground sm:text-lg">
                        {teamMatches.length} match{teamMatches.length === 1 ? "" : "es"}
                      </p>
                    </div>
                  </header>
                  <div className="grid gap-6 pt-1 lg:grid-cols-2">
                    {teamMatches.map((m) => (
                      <FightCard
                        key={`${team.id}-${m.id}`}
                        match={m}
                        teamName={teamName}
                        teamColor={teamColor}
                        teamDivisionId={teamDivisionId}
                        divisionById={divisionById}
                        onOpenDetails={openMatchDetails}
                        recentPlays={
                          m.status === "IN_PROGRESS"
                            ? recentByMatch.get(m.id) ?? []
                            : undefined
                        }
                        playerName={playerName}
                        statLabel={statLabel}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter by court"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCourtKey === ALL_COURTS}
              onClick={() => setSelectedCourtKey(ALL_COURTS)}
              className={cn(
                "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                selectedCourtKey === ALL_COURTS
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              )}
            >
              All courts
            </button>
            {courtsWithMatches.map((key) => {
              const selected = selectedCourtKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedCourtKey(key)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted/60"
                  )}
                >
                  {courtLabel(key)}
                </button>
              );
            })}
          </div>

          <div className="space-y-10">
            {visibleCourtSections.map(({ key, label, matches: courtMatches }) => (
              <section key={key} className="space-y-4">
                <header className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-sm bg-background/85">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                      {label}
                    </h3>
                    <p className="text-base text-muted-foreground sm:text-lg">
                      {courtMatches.length} match{courtMatches.length === 1 ? "" : "es"}
                    </p>
                  </div>
                </header>
                <div className="grid gap-6 pt-1 lg:grid-cols-2">
                  {courtMatches.map((m) => (
                    <FightCard
                      key={`${key}-${m.id}`}
                      match={m}
                      teamName={teamName}
                      teamColor={teamColor}
                      teamDivisionId={teamDivisionId}
                      divisionById={divisionById}
                      onOpenDetails={openMatchDetails}
                      recentPlays={
                        m.status === "IN_PROGRESS"
                          ? recentByMatch.get(m.id) ?? []
                          : undefined
                      }
                      playerName={playerName}
                      statLabel={statLabel}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
