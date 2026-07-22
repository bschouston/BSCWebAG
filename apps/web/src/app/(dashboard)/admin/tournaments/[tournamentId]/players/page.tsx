"use client";

import { useEffect, useMemo, useState, use } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { buildMatchTeamIndex, getPlayerDeleteBlockers } from "@bsc/shared";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

type PlayerRow = {
  id: string;
  displayName: string;
  number?: number | null;
  teamId?: string | null;
  createdAt?: { seconds?: number; toMillis?: () => number } | null;
};
type TeamRow = { id: string; name: string };

type AssignmentFilter = "all" | "assigned" | "unassigned";
type SortOption = "name-asc" | "name-desc" | "number-asc" | "number-desc" | "team" | "newest" | "oldest";

function createdAtMs(player: PlayerRow): number {
  const createdAt = player.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
  return 0;
}

function playerMatchesSearch(player: PlayerRow, teamLabel: string | null, queryText: string): boolean {
  const q = queryText.trim().toLowerCase();
  if (!q) return true;
  if (player.displayName.toLowerCase().includes(q)) return true;
  if (player.number != null && String(player.number).includes(q)) return true;
  if (teamLabel && teamLabel.toLowerCase().includes(q)) return true;
  return false;
}

function sortPlayers(
  players: PlayerRow[],
  sortBy: SortOption,
  teamNameFor: (teamId?: string | null) => string | null
): PlayerRow[] {
  const sorted = [...players];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "name-desc":
        return b.displayName.localeCompare(a.displayName, undefined, { sensitivity: "base" });
      case "number-asc": {
        const an = a.number ?? Number.POSITIVE_INFINITY;
        const bn = b.number ?? Number.POSITIVE_INFINITY;
        return an - bn || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
      }
      case "number-desc": {
        const an = a.number ?? Number.NEGATIVE_INFINITY;
        const bn = b.number ?? Number.NEGATIVE_INFINITY;
        return bn - an || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
      }
      case "team": {
        const at = teamNameFor(a.teamId) ?? "zzz";
        const bt = teamNameFor(b.teamId) ?? "zzz";
        return (
          at.localeCompare(bt, undefined, { sensitivity: "base" }) ||
          a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
        );
      }
      case "newest":
        return createdAtMs(b) - createdAtMs(a);
      case "oldest":
        return createdAtMs(a) - createdAtMs(b);
      case "name-asc":
      default:
        return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    }
  });
  return sorted;
}

export default function PlayersPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  // Local jersey-number drafts keyed by player id.
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [teamsInMatches, setTeamsInMatches] = useState<Set<string>>(new Set());
  const [playerMatchesPlayed, setPlayerMatchesPlayed] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    if (!user || !db) return;

    setLoading(true);
    const playersQuery = query(
      collection(db, "tournaments", tournamentId, "players"),
      orderBy("createdAt", "desc")
    );

    const unsubPlayers = onSnapshot(playersQuery, (snap) => {
      const players: PlayerRow[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<PlayerRow, "id">),
      }));
      setRows(players);
      setNumberDrafts((prev) => {
        const next = { ...prev };
        for (const p of players) {
          if (next[p.id] === undefined) {
            next[p.id] = p.number != null ? String(p.number) : "";
          }
        }
        return next;
      });
      setLoading(false);
    });

    const unsubTeams = onSnapshot(
      collection(db, "tournaments", tournamentId, "teams"),
      (snap) => {
        setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeamRow, "id">) })));
      }
    );

    const unsubMatches = onSnapshot(
      collection(db, "tournaments", tournamentId, "matches"),
      (snap) => {
        const matches = snap.docs.map((d) => d.data() as { teamAId?: string; teamBId?: string });
        setTeamsInMatches(buildMatchTeamIndex(matches).teamsInMatches);
      }
    );

    const unsubStats = onSnapshot(
      collection(db, "tournaments", tournamentId, "playerStats"),
      (snap) => {
        const map = new Map<string, number>();
        for (const d of snap.docs) {
          const mp = Number((d.data() as { matchesPlayed?: number }).matchesPlayed ?? 0);
          map.set(d.id, mp);
        }
        setPlayerMatchesPlayed(map);
      }
    );

    return () => {
      unsubPlayers();
      unsubTeams();
      unsubMatches();
      unsubStats();
    };
  }, [user, tournamentId]);

  const playerDeleteBlockers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of rows) {
      map.set(
        p.id,
        getPlayerDeleteBlockers({
          teamInMatch: p.teamId ? teamsInMatches.has(p.teamId) : false,
          inPlayLog: false,
          matchesPlayed: playerMatchesPlayed.get(p.id) ?? 0,
        })
      );
    }
    return map;
  }, [rows, teamsInMatches, playerMatchesPlayed]);

  const add = async () => {
    setSubmitting(true);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        displayName,
        number: newNumber.trim() === "" ? null : Number(newNumber),
      }),
    });
    setDisplayName("");
    setNewNumber("");
    setSubmitting(false);
  };

  const saveNumber = async (player: PlayerRow) => {
    const draft = (numberDrafts[player.id] ?? "").trim();
    const next = draft === "" ? null : Number(draft);
    if (draft !== "" && !Number.isFinite(next)) return;
    const current = player.number ?? null;
    if (next === current) return;

    setBusyId(player.id);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ number: next }),
    });
    setRows((prev) => prev.map((p) => (p.id === player.id ? { ...p, number: next } : p)));
    setBusyId(null);
  };

  const remove = async (playerId: string) => {
    const blockers = playerDeleteBlockers.get(playerId) ?? [];
    if (blockers.length) return;
    if (!window.confirm("Delete this player?")) return;
    setBusyId(playerId);
    const token = await user?.getIdToken();
    const res = await fetch(`/api/tournaments/${tournamentId}/players/${playerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail =
        Array.isArray(data?.blockers) && data.blockers.length
          ? `${data.error ?? "Cannot delete player"}: ${data.blockers.join("; ")}`
          : (data?.error ?? "Failed to delete player");
      window.alert(detail);
    } else {
      setRows((prev) => prev.filter((p) => p.id !== playerId));
    }
    setBusyId(null);
  };

  const teamName = (teamId?: string | null) =>
    teams.find((t) => t.id === teamId)?.name ?? null;

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [teams]
  );

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((player) => {
      if (assignmentFilter === "assigned" && !player.teamId) return false;
      if (assignmentFilter === "unassigned" && player.teamId) return false;
      if (teamFilter !== "all" && player.teamId !== teamFilter) return false;
      return playerMatchesSearch(player, teamName(player.teamId), search);
    });
    return sortPlayers(filtered, sortBy, teamName);
  }, [rows, assignmentFilter, teamFilter, search, sortBy, teams]);

  const hasActiveFilters =
    search.trim() !== "" || assignmentFilter !== "all" || teamFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setAssignmentFilter("all");
    setTeamFilter("all");
  };

  const syncFromRegistrations = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/sync-registrations`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncMessage(
        (data.upserted ?? 0) > 0
          ? `Added ${data.upserted} new player${data.upserted === 1 ? "" : "s"} from registrations.`
          : "No new players to add — everyone is already in the tournament."
      );
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add player</CardTitle>
          <CardDescription>Assign players to teams from the Teams tab.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <Label>Player name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Jersey #</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <Button disabled={!displayName.trim() || submitting} onClick={add}>
            {submitting ? "Adding…" : "Add player"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle>Players ({rows.length})</CardTitle>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" size="sm" disabled={syncing} onClick={() => void syncFromRegistrations()}>
              {syncing ? "Syncing…" : "Sync from registrations"}
            </Button>
            {syncMessage ? (
              <p className="text-xs text-muted-foreground max-w-[220px] text-right">{syncMessage}</p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loading && rows.length > 0 ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, jersey #, or team…"
                  className="pl-9"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Assignment</Label>
                  <Select
                    value={assignmentFilter}
                    onValueChange={(v) => setAssignmentFilter(v as AssignmentFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All players</SelectItem>
                      <SelectItem value="assigned">Assigned to team</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Team</Label>
                  <Select value={teamFilter} onValueChange={setTeamFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All teams</SelectItem>
                      {sortedTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label className="text-xs text-muted-foreground">Sort by</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                      <SelectItem value="number-asc">Jersey # (low–high)</SelectItem>
                      <SelectItem value="number-desc">Jersey # (high–low)</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {visibleRows.length} of {rows.length} player{rows.length === 1 ? "" : "s"}
                </span>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground">No players yet.</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-muted-foreground">No players match your filters.</div>
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((p) => {
                const deleteBlockers = playerDeleteBlockers.get(p.id) ?? [];
                return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{p.displayName}</span>
                    {teamName(p.teamId) ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {teamName(p.teamId)}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground/60">Unassigned</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">#</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="w-20 h-8"
                        value={numberDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setNumberDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        onBlur={() => void saveNumber(p)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        disabled={busyId === p.id}
                        placeholder="—"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void remove(p.id)}
                      disabled={busyId === p.id || deleteBlockers.length > 0}
                      title={deleteBlockers.length ? deleteBlockers.join("; ") : undefined}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
