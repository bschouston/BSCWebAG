"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type LeaderboardColumn = { field: string; label: string };

export type LeaderboardPlayer = {
  id: string;
  displayName?: string | null;
  teamId?: string | null;
  points: number;
  [key: string]: unknown;
};

export type LeaderboardTeam = {
  id: string;
  name: string;
};

type SortKey = "points" | string;
type SortDir = "asc" | "desc";

const ALL_TEAMS = "__all__";

export function PublicLeaderboard({
  players,
  teams,
  columns,
}: {
  players: LeaderboardPlayer[];
  teams: LeaderboardTeam[];
  columns: LeaderboardColumn[];
}) {
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.name]));
    return (id?: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [teams]);

  const teamOptions = useMemo(() => {
    const ids = new Set(
      players.map((p) => p.teamId).filter((id): id is string => !!id)
    );
    return teams
      .filter((t) => ids.has(t.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, teams]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = players.filter((p) => {
      if (teamFilter !== ALL_TEAMS && p.teamId !== teamFilter) return false;
      if (!q) return true;
      const name = String(p.displayName ?? "").toLowerCase();
      const team = teamName(p.teamId).toLowerCase();
      return name.includes(q) || team.includes(q);
    });

    list = [...list].sort((a, b) => {
      const aVal =
        sortKey === "points"
          ? a.points
          : Number((a as Record<string, unknown>)[sortKey] ?? 0);
      const bVal =
        sortKey === "points"
          ? b.points
          : Number((b as Record<string, unknown>)[sortKey] ?? 0);
      const diff = sortDir === "desc" ? bVal - aVal : aVal - bVal;
      if (diff !== 0) return diff;
      return String(a.displayName ?? "").localeCompare(String(b.displayName ?? ""));
    });

    return list;
  }, [players, query, teamFilter, sortKey, sortDir, teamName]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "desc" ? " ↓" : " ↑";
  };

  if (players.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-base text-muted-foreground text-center md:text-lg">
        Leaderboard will populate as stats are recorded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player or team…"
          className="sm:max-w-xs h-11 text-base"
          aria-label="Search leaderboard"
        />
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="sm:w-56 h-11 text-base" aria-label="Filter by team">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TEAMS}>All teams</SelectItem>
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground md:text-base">
          {rows.length} player{rows.length === 1 ? "" : "s"}
          {sortKey === "points" ? " · sorted by Value" : null}
        </p>
      </div>

      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-base md:text-lg">
          <thead>
            <tr className="border-b text-muted-foreground text-left">
              <th className="px-4 py-3 font-semibold">#</th>
              <th className="px-3 py-3 font-semibold">Player</th>
              <th className="px-3 py-3 font-semibold">Team</th>
              {columns.map((c) => (
                <th key={c.field} className="px-3 py-3 font-semibold text-center">
                  <button
                    type="button"
                    className={cn(
                      "hover:text-foreground transition-colors",
                      sortKey === c.field && "text-foreground"
                    )}
                    onClick={() => toggleSort(c.field)}
                  >
                    {c.label}
                    {sortIndicator(c.field)}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3 font-semibold text-center">
                <button
                  type="button"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    sortKey === "points" && "text-foreground"
                  )}
                  onClick={() => toggleSort("points")}
                >
                  Value
                  {sortIndicator("points")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No players match your filters.
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={p.id} className={i % 2 ? "bg-muted/20" : undefined}>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-3 font-semibold">{p.displayName ?? "Player"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{teamName(p.teamId)}</td>
                  {columns.map((c) => (
                    <td key={c.field} className="px-3 py-3 text-center tabular-nums">
                      {Number((p as Record<string, unknown>)[c.field] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold tabular-nums">{p.points}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
