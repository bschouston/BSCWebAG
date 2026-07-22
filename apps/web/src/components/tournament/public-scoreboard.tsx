"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import type { TrackerStat } from "@bsc/shared";
import { db } from "@/lib/firebase/client";
import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

export type ScoreboardMatch = {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  courtNumber?: number;
};

export type ScoreboardTeam = {
  id: string;
  name: string;
  color?: string | null;
};

export type ScoreboardPlayer = {
  id: string;
  displayName?: string | null;
};

type RecentPlay = {
  id: string;
  seq: number;
  teamKey: "A" | "B";
  setNumber?: number;
  deleted?: boolean;
  entries: { playerId: string | null; statKey: string }[];
};

const DEFAULT_TEAM_COLOR = "#1a3556";
const RECENT_PLAY_LIMIT = 6;

function TeamChip({ name, color }: { name: string; color?: string | null }) {
  const bg = color || DEFAULT_TEAM_COLOR;
  return (
    <div
      className="mx-auto w-full max-w-full rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5"
      style={{ backgroundColor: bg, color: readableTextColor(bg) }}
      title={name}
    >
      <div className="text-sm font-bold leading-tight break-words line-clamp-2 sm:text-base md:text-lg">
        {name}
      </div>
    </div>
  );
}

function SetScorePills({
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
      const q = query(playsRef, orderBy("seq", "desc"), limit(RECENT_PLAY_LIMIT * 2));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const plays: RecentPlay[] = snap.docs
            .map((d) => {
              const data = d.data() as Omit<RecentPlay, "id">;
              return {
                id: d.id,
                seq: typeof data.seq === "number" ? data.seq : 0,
                teamKey: data.teamKey === "B" ? "B" : "A",
                setNumber: data.setNumber,
                deleted: data.deleted === true,
                entries: Array.isArray(data.entries) ? data.entries : [],
              };
            })
            .filter((p) => !p.deleted)
            .slice(0, RECENT_PLAY_LIMIT);

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

function formatPlayLine(
  play: RecentPlay,
  playerName: (id: string | null) => string,
  statLabel: (key: string) => string,
  teamName: string
): string {
  const entry = play.entries[0];
  const team = teamName || `Team ${play.teamKey}`;
  if (!entry) return `Point · ${team}`;
  const stat = statLabel(entry.statKey);
  const player = entry.playerId ? playerName(entry.playerId) : null;
  if (player) return `${stat} · ${player} · ${team}`;
  return `${stat} · ${team}`;
}

export function PublicScoreboard({
  matches,
  teams,
  periodLabel,
  periodsWonLabel,
  tournamentId,
  configStats = [],
  players = [],
}: {
  matches: ScoreboardMatch[];
  teams: ScoreboardTeam[];
  periodLabel: string;
  periodsWonLabel: string;
  tournamentId?: string;
  configStats?: TrackerStat[];
  players?: ScoreboardPlayer[];
}) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const matchIds = useMemo(() => matches.map((m) => m.id), [matches]);
  const recentByMatch = useRecentPlaysByMatch(tournamentId, matchIds);

  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p.id, p.displayName ?? p.id]));
    return (id: string | null) => (id ? map.get(id) ?? "Player" : "Player");
  }, [players]);

  const statLabel = useMemo(() => {
    const map = new Map(configStats.map((s) => [s.key, s.shortLabel || s.label || s.key]));
    return (key: string) => map.get(key) ?? key;
  }, [configStats]);

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-base text-muted-foreground text-center md:text-lg">
        No matches in progress right now.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
      {matches.map((m) => {
        const set = m.currentSet ?? 1;
        const live = m.setScores?.[set - 1] ?? { a: 0, b: 0 };
        const teamA = teamById.get(m.teamAId);
        const teamB = teamById.get(m.teamBId);
        const recent = recentByMatch.get(m.id) ?? [];
        return (
          <div
            key={m.id}
            className={cn(
              "rounded-2xl border-2 border-red-500/30 bg-card p-6 md:p-8 shadow-sm",
              "ring-1 ring-red-500/20 flex flex-col gap-4"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground md:text-base">
              <span className="font-semibold">
                {periodLabel} {set}
                {m.courtNumber != null ? ` · Court ${m.courtNumber}` : ""}
              </span>
              <span className="inline-flex items-center gap-2 font-bold uppercase tracking-wide text-red-600">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
                </span>
                Live
              </span>
            </div>

            <div className="grid grid-cols-3 items-center gap-2 text-center">
              <div className="min-w-0 space-y-2">
                <TeamChip name={teamA?.name ?? "Team"} color={teamA?.color} />
                <div className="text-5xl font-black tabular-nums md:text-6xl">{live.a}</div>
                <div className="text-sm font-semibold text-muted-foreground md:text-base">
                  {periodsWonLabel} {m.scoreA ?? 0}
                </div>
              </div>
              <div className="text-muted-foreground text-lg font-extrabold tracking-widest md:text-xl">
                VS
              </div>
              <div className="min-w-0 space-y-2">
                <TeamChip name={teamB?.name ?? "Team"} color={teamB?.color} />
                <div className="text-5xl font-black tabular-nums md:text-6xl">{live.b}</div>
                <div className="text-sm font-semibold text-muted-foreground md:text-base">
                  {periodsWonLabel} {m.scoreB ?? 0}
                </div>
              </div>
            </div>

            {(m.setScores?.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
                  Set points
                </div>
                <SetScorePills setScores={m.setScores} highlightIndex={set - 1} />
              </div>
            ) : null}

            {tournamentId ? (
              <div className="border-t pt-3 space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
                  Recent
                </div>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Waiting for plays…</p>
                ) : (
                  <ul className="space-y-1">
                    {recent.map((play) => {
                      const playTeamName =
                        play.teamKey === "B"
                          ? (teamB?.name ?? "Team B")
                          : (teamA?.name ?? "Team A");
                      const line = formatPlayLine(
                        play,
                        playerName,
                        statLabel,
                        playTeamName
                      );
                      return (
                        <li
                          key={play.id}
                          className="text-sm md:text-base text-foreground/90 truncate"
                          title={line}
                        >
                          {line}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
