"use client";

import { memo, useMemo, useState } from "react";
import { playerFantasyValue, type LeaderboardColumnDef } from "@bsc/shared";
import { Input, cn } from "@bsc/ui";
import { normalizeHexColor, readableTextColor } from "@/lib/color-contrast";
import type { LivePlayerRow } from "@/lib/use-live-tournament-stats";

type SortKey = "points" | "pointsScored" | "fantasyValue" | string;
type SortDir = "asc" | "desc";

function TeamBadge({ name, color }: { name: string; color: string | null }) {
  if (!name || name === "—") return <span className="text-muted-foreground">—</span>;
  const hex = normalizeHexColor(color);
  if (!hex) {
    return (
      <span className="inline-flex min-w-0 items-center rounded-md border px-2.5 py-1 text-xs sm:text-sm font-semibold">
        <span className="truncate">{name}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex min-w-0 items-center rounded-md px-2.5 py-1 text-xs sm:text-sm font-semibold"
      style={{ backgroundColor: hex, color: readableTextColor(hex) }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

function playerLabel(player: LivePlayerRow) {
  if (player.number != null) return `#${player.number} ${player.displayName}`;
  return player.displayName;
}

export function FantasyValueMention({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-border/80 bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums text-muted-foreground"
      title={`Fantasy Value ${value}`}
    >
      Value {value}
    </span>
  );
}

/** Leaderboard-style stat table shared by roster views and the player browser. */
export function PlayerStatTable({
  players,
  columns,
  pointsColor,
  playerValues,
  searchable = false,
  emptyMessage = "No players yet.",
}: {
  players: LivePlayerRow[];
  columns: LeaderboardColumnDef[];
  pointsColor?: string;
  /** Fantasy roster prices keyed by player id. */
  playerValues?: Record<string, number> | null;
  searchable?: boolean;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter(
          (p) =>
            p.displayName.toLowerCase().includes(q) ||
            p.teamName.toLowerCase().includes(q) ||
            (p.number != null && String(p.number).includes(q))
        )
      : players;

    const valueOf = (p: LivePlayerRow) => {
      if (sortKey === "points") return p.points;
      if (sortKey === "fantasyValue") return playerFantasyValue(p.id, playerValues);
      return Number(p.stats[sortKey] ?? 0);
    };

    return [...filtered].sort((a, b) => {
      const diff = sortDir === "desc" ? valueOf(b) - valueOf(a) : valueOf(a) - valueOf(b);
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [players, query, sortKey, sortDir, playerValues]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const indicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="space-y-3 w-full min-w-0">
      {searchable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players or teams…"
            className="max-w-xs h-10"
            aria-label="Search players"
          />
          <p className="text-sm text-muted-foreground">
            {rows.length} player{rows.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card overflow-x-auto w-full">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">#</th>
              <th className="px-3 py-2.5 font-semibold">
                <button
                  type="button"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    sortKey === "fantasyValue" && "text-foreground"
                  )}
                  onClick={() => toggleSort("fantasyValue")}
                >
                  Player
                  {indicator("fantasyValue")}
                </button>
              </th>
              <th className="px-3 py-2.5 font-semibold">Team</th>
              {columns.map((c) => (
                <th key={c.field} className="px-2.5 py-2.5 font-semibold text-center">
                  <button
                    type="button"
                    className={cn(
                      "transition-opacity hover:opacity-80 whitespace-nowrap",
                      sortKey === c.field && "underline underline-offset-2"
                    )}
                    style={c.color ? { color: c.color } : undefined}
                    onClick={() => toggleSort(c.field)}
                  >
                    {c.label}
                    {indicator(c.field)}
                  </button>
                </th>
              ))}
              <th className="px-2.5 py-2.5 font-semibold text-center">
                <button
                  type="button"
                  className={cn(
                    "transition-opacity hover:opacity-80",
                    sortKey === "pointsScored" && "underline underline-offset-2"
                  )}
                  style={pointsColor ? { color: pointsColor } : undefined}
                  onClick={() => toggleSort("pointsScored")}
                >
                  Points
                  {indicator("pointsScored")}
                </button>
              </th>
              <th className="px-3 py-2.5 font-semibold text-center">
                <button
                  type="button"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    sortKey === "points" && "text-foreground"
                  )}
                  onClick={() => toggleSort("points")}
                >
                  Fantasy Pts
                  {indicator("points")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5 + columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <StatRow
                  key={p.id}
                  player={p}
                  rank={i + 1}
                  striped={i % 2 === 1}
                  columns={columns}
                  fantasyValue={playerFantasyValue(p.id, playerValues)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const StatRow = memo(function StatRow({
  player,
  rank,
  striped,
  columns,
  fantasyValue,
}: {
  player: LivePlayerRow;
  rank: number;
  striped: boolean;
  columns: LeaderboardColumnDef[];
  fantasyValue: number;
}) {
  return (
    <tr className={striped ? "bg-muted/25" : undefined}>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{rank}</td>
      <td className="px-3 py-2.5 font-semibold whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          {playerLabel(player)}
          <FantasyValueMention value={fantasyValue} />
        </span>
      </td>
      <td className="px-3 py-2.5">
        <TeamBadge name={player.teamName} color={player.teamColor} />
      </td>
      {columns.map((c) => (
        <td key={c.field} className="px-2.5 py-2.5 text-center tabular-nums">
          {Number(player.stats[c.field] ?? 0)}
        </td>
      ))}
      <td className="px-2.5 py-2.5 text-center tabular-nums">
        {Number(player.stats.pointsScored ?? 0)}
      </td>
      <td className="px-3 py-2.5 text-center font-bold tabular-nums">
        {player.points.toFixed(1)}
      </td>
    </tr>
  );
});
