"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, Lock, LockOpen, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  cn,
} from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { FantasyValueMention } from "@/components/player-stat-table";
import { isFantasyAdminProfile, useAuth } from "@/lib/auth-context";
import { useLiveTournamentStats } from "@/lib/use-live-tournament-stats";
import {
  computeFantasyRosterCost,
  computeFantasyTeamValue,
} from "@bsc/shared";

const ALL_TEAMS = "__all__";
const TEAM_PAGE_SIZE = 15;
type TeamLockFilter = "all" | "locked" | "unlocked";
type TeamSortKey =
  | "teamName"
  | "ownerDisplayName"
  | "ownerEmail"
  | "players"
  | "budgetUsed"
  | "budgetUnused"
  | "fantasyPoints"
  | "createdAt"
  | "updatedAt"
  | "locked";
type SortDirection = "asc" | "desc";

type FantasyTeamRow = {
  id: string;
  teamName?: string;
  ownerDisplayName?: string;
  ownerEmail?: string | null;
  playerIds?: string[];
  locked?: boolean;
  effectivelyLocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export default function FantasyAdminTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, profile, loading } = useAuth();
  const { tournamentName, livePlayers, teams, config, statsById } =
    useLiveTournamentStats(tournamentId);

  const [teamSize, setTeamSize] = useState(7);
  const [teamsLockedGlobal, setTeamsLockedGlobal] = useState(false);
  const [eligibleTeamIds, setEligibleTeamIds] = useState<string[]>([]);
  const [maxBudget, setMaxBudget] = useState("");
  const [playerValues, setPlayerValues] = useState<Record<string, string>>({});
  const [valueQuery, setValueQuery] = useState("");
  const [valueTeamFilter, setValueTeamFilter] = useState(ALL_TEAMS);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeamRow[]>([]);
  const [teamQuery, setTeamQuery] = useState("");
  const [teamLockFilter, setTeamLockFilter] = useState<TeamLockFilter>("all");
  const [teamSort, setTeamSort] = useState<{
    key: TeamSortKey;
    direction: SortDirection;
  }>({ key: "fantasyPoints", direction: "desc" });
  const [teamPage, setTeamPage] = useState(1);
  const [analytics, setAnalytics] = useState<{
    fantasyTeamCount: number;
    lockedCount: number;
    mostUsedPlayers: {
      playerId: string;
      displayName: string;
      teamCount: number;
      fantasyValue: number;
      fantasyPoints: number;
    }[];
    mostValuablePlayer: {
      playerId: string;
      displayName: string;
      fantasyPoints: number;
      fantasyValue: number;
      teamCount: number;
    } | null;
    avgPointsByFantasyValue: {
      fantasyValue: number;
      playerCount: number;
      averageFantasyPoints: number;
    }[];
    statLeaders: {
      field: string;
      label: string;
      color?: string;
      teamId: string | null;
      teamName: string | null;
      total: number;
    }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const headers = async () => {
    const token = await user!.getIdToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  const load = async () => {
    if (!user) return;
    const h = await headers();
    const [cfgRes, teamsRes, analyticsRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/fantasy/config`, { headers: h }),
      fetch(`/api/tournaments/${tournamentId}/fantasy/teams`, { headers: h }),
      fetch(`/api/tournaments/${tournamentId}/fantasy/analytics`, { headers: h }),
    ]);
    const cfg = await cfgRes.json().catch(() => ({}));
    const t = await teamsRes.json().catch(() => ({}));
    const a = await analyticsRes.json().catch(() => ({}));
    if (cfg.config) {
      setTeamSize(Number(cfg.config.teamSize ?? 7));
      setTeamsLockedGlobal(cfg.config.teamsLockedGlobal === true);
      setEligibleTeamIds(cfg.config.eligibleTeamIds ?? []);
      const budget = cfg.config.maxBudget;
      setMaxBudget(
        typeof budget === "number" && Number.isFinite(budget) && budget > 0
          ? String(budget)
          : ""
      );
      const values = (cfg.config.playerValues ?? {}) as Record<string, number>;
      const drafts: Record<string, string> = {};
      for (const [id, v] of Object.entries(values)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          drafts[id] = String(v);
        }
      }
      setPlayerValues(drafts);
    }
    setFantasyTeams(t.teams ?? []);
    setAnalytics(a.fantasyTeamCount != null ? a : null);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (!isFantasyAdminProfile(profile)) {
      window.location.assign("/");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, loading, tournamentId]);

  const poolPlayers = useMemo(() => {
    if (eligibleTeamIds.length === 0) return livePlayers;
    return livePlayers.filter((p) => p.teamId && eligibleTeamIds.includes(p.teamId));
  }, [livePlayers, eligibleTeamIds]);

  const valueFilterTeams = useMemo(() => {
    const ids = new Set(poolPlayers.map((p) => p.teamId).filter(Boolean) as string[]);
    return teams
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [poolPlayers, teams]);

  const valueVisible = useMemo(() => {
    const q = valueQuery.trim().toLowerCase();
    return poolPlayers
      .filter((p) => {
        if (valueTeamFilter !== ALL_TEAMS && p.teamId !== valueTeamFilter) return false;
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.teamName.toLowerCase().includes(q) ||
          (p.number != null && String(p.number).includes(q))
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [poolPlayers, valueTeamFilter, valueQuery]);

  const configuredBudget = useMemo(() => {
    const value = Number(maxBudget);
    return maxBudget.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
  }, [maxBudget]);

  const numericPlayerValues = useMemo(() => {
    const values: Record<string, number> = {};
    for (const [id, raw] of Object.entries(playerValues)) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) values[id] = value;
    }
    return values;
  }, [playerValues]);

  const visibleFantasyTeams = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    const rows = fantasyTeams
      .map((team) => {
        const budgetUsed = computeFantasyRosterCost(
          team.playerIds ?? [],
          numericPlayerValues
        );
        const remaining =
          configuredBudget == null ? null : configuredBudget - budgetUsed;
        const fantasyPoints = config
          ? computeFantasyTeamValue(team.playerIds ?? [], statsById, config)
          : 0;
        return {
          ...team,
          budgetUsed,
          budgetUnused: remaining == null ? null : Math.max(remaining, 0),
          fantasyPoints,
          createdMs: team.createdAt ? Date.parse(team.createdAt) : 0,
          updatedMs: team.updatedAt ? Date.parse(team.updatedAt) : 0,
        };
      })
      .filter((team) => {
        const locked = team.effectivelyLocked === true;
        if (teamLockFilter === "locked" && !locked) return false;
        if (teamLockFilter === "unlocked" && locked) return false;
        if (!q) return true;
        return [team.teamName, team.ownerDisplayName, team.ownerEmail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });

    const direction = teamSort.direction === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let left: string | number | boolean | null | undefined;
      let right: string | number | boolean | null | undefined;
      switch (teamSort.key) {
        case "players":
          left = a.playerIds?.length ?? 0;
          right = b.playerIds?.length ?? 0;
          break;
        case "locked":
          left = a.effectivelyLocked === true;
          right = b.effectivelyLocked === true;
          break;
        case "budgetUsed":
        case "budgetUnused":
        case "fantasyPoints":
          left = a[teamSort.key];
          right = b[teamSort.key];
          break;
        case "createdAt":
          left = a.createdMs;
          right = b.createdMs;
          break;
        case "updatedAt":
          left = a.updatedMs;
          right = b.updatedMs;
          break;
        default:
          left = a[teamSort.key] ?? "";
          right = b[teamSort.key] ?? "";
      }
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      return (
        String(left ?? "").localeCompare(String(right ?? ""), undefined, {
          sensitivity: "base",
        }) * direction
      );
    });
  }, [
    config,
    configuredBudget,
    fantasyTeams,
    numericPlayerValues,
    statsById,
    teamLockFilter,
    teamQuery,
    teamSort,
  ]);

  const changeTeamSort = (key: TeamSortKey) => {
    setTeamSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            direction:
              key === "fantasyPoints" ||
              key === "budgetUsed" ||
              key === "budgetUnused" ||
              key === "players" ||
              key === "createdAt" ||
              key === "updatedAt"
                ? "desc"
                : "asc",
          }
    );
    setTeamPage(1);
  };

  const teamPageCount = Math.max(
    1,
    Math.ceil(visibleFantasyTeams.length / TEAM_PAGE_SIZE)
  );
  const safeTeamPage = Math.min(teamPage, teamPageCount);
  const pagedFantasyTeams = useMemo(() => {
    const start = (safeTeamPage - 1) * TEAM_PAGE_SIZE;
    return visibleFantasyTeams.slice(start, start + TEAM_PAGE_SIZE);
  }, [safeTeamPage, visibleFantasyTeams]);

  useEffect(() => {
    setTeamPage(1);
  }, [teamQuery, teamLockFilter]);

  useEffect(() => {
    if (teamPage > teamPageCount) setTeamPage(teamPageCount);
  }, [teamPage, teamPageCount]);

  const sortLabel = (key: TeamSortKey, label: string) => {
    const marker =
      teamSort.key === key ? (teamSort.direction === "asc" ? " ↑" : " ↓") : "";
    return `${label}${marker}`;
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return { date: "—", time: "" };
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return { date: "—", time: "" };
    const d = new Date(ms);
    return {
      date: d.toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      }),
      time: d
        .toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
        .replace(/\s?(AM|PM)/i, (_, m: string) => m.toLowerCase()),
    };
  };

  const saveConfig = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const cleanedValues: Record<string, number> = {};
      for (const [id, raw] of Object.entries(playerValues)) {
        const n = Number(String(raw).trim());
        if (!Number.isFinite(n) || n <= 0) continue;
        cleanedValues[id] = n;
      }
      const budgetNum = maxBudget.trim() === "" ? null : Number(maxBudget);
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/config`, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({
          teamSize,
          teamsLockedGlobal,
          eligibleTeamIds,
          eligiblePlayerIds: [],
          maxBudget:
            budgetNum != null && Number.isFinite(budgetNum) && budgetNum > 0
              ? budgetNum
              : null,
          playerValues: cleanedValues,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setMessage("Pool, budget & player values saved.");
      await load();
    } catch (e: any) {
      setMessage(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const setTeamLocked = async (ownerUid: string, locked: boolean) => {
    setBusy(true);
    try {
      await fetch(`/api/tournaments/${tournamentId}/fantasy/teams/${ownerUid}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ locked }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setGlobalRosterLock = async (locked: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/teams`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify({ locked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Global lock update failed");
      setTeamsLockedGlobal(locked);
      setMessage(
        locked
          ? "Global roster lock is on. Users cannot create or edit rosters."
          : "Global roster lock is off. Individual team locks still apply."
      );
      await load();
    } catch (e: any) {
      setMessage(e?.message ?? "Global lock update failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteTeam = async (ownerUid: string, teamName: string) => {
    const label = teamName.trim() || "this team";
    if (
      !window.confirm(
        `Delete ${label}? This permanently removes the fantasy team and cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/tournaments/${tournamentId}/fantasy/teams/${ownerUid}`,
        {
          method: "DELETE",
          headers: await headers(),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      setMessage(`Deleted ${label}.`);
      await load();
    } catch (e: any) {
      setMessage(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleEligibleTeam = (id: string) => {
    setEligibleTeamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (loading || !user || !isFantasyAdminProfile(profile)) return null;

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Fantasy Admin</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {tournamentName}
          </h1>
        </div>

        <Tabs defaultValue="teams" className="gap-6">
          <TabsList className="h-11 w-full justify-start gap-1 rounded-xl border border-border bg-muted/70 p-1 dark:bg-muted/40">
            <TabsTrigger
              value="teams"
              className="h-9 flex-none rounded-lg px-4 text-sm font-bold text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-bsc-red data-[state=active]:shadow-sm dark:data-[state=active]:bg-card dark:data-[state=active]:text-bsc-red"
            >
              Teams
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="h-9 flex-none rounded-lg px-4 text-sm font-bold text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-bsc-red data-[state=active]:shadow-sm dark:data-[state=active]:bg-card dark:data-[state=active]:text-bsc-red"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="h-9 flex-none rounded-lg px-4 text-sm font-bold text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-bsc-red data-[state=active]:shadow-sm dark:data-[state=active]:bg-card dark:data-[state=active]:text-bsc-red"
            >
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">
        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Pool &amp; budget</CardTitle>
            <CardDescription>
              Team size, budget, and which real teams feed the fantasy pool.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <div className="space-y-1.5">
                <Label>Team size</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max team budget</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value)}
                  placeholder="No limit"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for no budget cap. Sum of Fantasy Values cannot exceed this.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Eligible real teams (empty = all players)</Label>
              <div className="grid sm:grid-cols-2 gap-2">
                {teams.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2"
                  >
                    <Checkbox
                      checked={eligibleTeamIds.includes(t.id)}
                      onCheckedChange={() => toggleEligibleTeam(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Global roster lock</CardTitle>
            <CardDescription>
              When on, no user can create or edit a roster — including people who sign up after
              you lock. Individual locks on the Teams tab still work on top of this.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "rounded-xl border px-4 py-3 text-sm",
                teamsLockedGlobal
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                  : "bg-muted/40 text-muted-foreground"
              )}
            >
              Status:{" "}
              <span className="font-bold text-foreground">
                {teamsLockedGlobal ? "Locked for everyone" : "Unlocked"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={teamsLockedGlobal ? "outline" : "default"}
                disabled={busy || teamsLockedGlobal}
                onClick={() => void setGlobalRosterLock(true)}
                className="font-bold"
              >
                <Lock className="h-4 w-4" />
                Lock all teams
              </Button>
              <Button
                variant="outline"
                disabled={busy || !teamsLockedGlobal}
                onClick={() => void setGlobalRosterLock(false)}
              >
                <LockOpen className="h-4 w-4" />
                Unlock all teams
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Player Fantasy Values</CardTitle>
            <CardDescription>
              Set each player&apos;s price for roster building. Blank or 0 means free. Save with
              the button below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  valueTeamFilter === ALL_TEAMS
                    ? "bg-bsc-red text-bsc-red-foreground border-bsc-red"
                    : "bg-card text-muted-foreground"
                }`}
                onClick={() => setValueTeamFilter(ALL_TEAMS)}
              >
                All teams
              </button>
              {valueFilterTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    valueTeamFilter === t.id
                      ? "bg-bsc-red text-bsc-red-foreground border-bsc-red"
                      : "bg-card text-muted-foreground"
                  }`}
                  onClick={() => setValueTeamFilter(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <Input
              value={valueQuery}
              onChange={(e) => setValueQuery(e.target.value)}
              placeholder="Search name or jersey #…"
              className="max-w-sm"
            />
            <div className="rounded-xl border overflow-hidden">
              <div className="max-h-[min(28rem,55vh)] overflow-y-auto divide-y">
                {valueVisible.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No players match this filter.
                  </p>
                ) : (
                  valueVisible.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">
                          {p.number != null ? (
                            <span className="text-muted-foreground font-medium">
                              #{p.number}{" "}
                            </span>
                          ) : null}
                          {p.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.teamName}
                        </div>
                      </div>
                      <div className="w-24 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          className="h-9 text-right tabular-nums"
                          aria-label={`Fantasy Value for ${p.displayName}`}
                          value={playerValues[p.id] ?? ""}
                          placeholder="0"
                          onChange={(e) =>
                            setPlayerValues((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {valueVisible.length} of {poolPlayers.length} pool players.
            </p>
            <Button onClick={() => void saveConfig()} disabled={busy} className="font-bold">
              Save settings
            </Button>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="teams" className="space-y-6">
        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Fantasy teams ({fantasyTeams.length})</CardTitle>
            <CardDescription>
              Search, filter, sort, review budget usage, and lock or unlock individual teams.
              Use Settings for the global roster lock.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-1.5">
                <Label htmlFor="fantasy-team-search">Search teams</Label>
                <Input
                  id="fantasy-team-search"
                  value={teamQuery}
                  onChange={(e) => {
                    setTeamQuery(e.target.value);
                    setTeamPage(1);
                  }}
                  placeholder="Team, owner, or email…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fantasy-team-lock-filter">Lock status</Label>
                <select
                  id="fantasy-team-lock-filter"
                  value={teamLockFilter}
                  onChange={(e) => {
                    setTeamLockFilter(e.target.value as TeamLockFilter);
                    setTeamPage(1);
                  }}
                  className="flex h-9 min-w-36 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="all">All teams</option>
                  <option value="locked">Locked</option>
                  <option value="unlocked">Unlocked</option>
                </select>
              </div>
            </div>

            {teamsLockedGlobal ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-950 dark:text-amber-100">
                Global roster lock is on — users cannot edit any roster. Individual locks below
                still apply after you turn global lock off.
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Budget used is the roster&apos;s total Fantasy Value. Unused never goes below zero.
            </p>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1100px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                  <col className="w-[5%]" />
                  <col className="w-[6%]" />
                  <col className="w-[6%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[5%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead className="bg-muted/60">
                  <tr>
                    {(
                      [
                        ["teamName", "Team", "text-left"],
                        ["ownerDisplayName", "Owner", "text-left"],
                        ["ownerEmail", "Email", "text-left"],
                        ["players", "#", "text-center"],
                        ["budgetUsed", "Used", "text-center"],
                        ["budgetUnused", "Unused", "text-center"],
                        ["fantasyPoints", "Fantasy Pts", "text-center"],
                        ["createdAt", "Created", "text-center"],
                        ["updatedAt", "Modified", "text-center"],
                        ["locked", "", "text-center"],
                      ] as const
                    ).map(([key, label, align]) => (
                      <th
                        key={key}
                        className={cn(
                          "px-2.5 py-2 font-semibold align-bottom",
                          align
                        )}
                        title={
                          key === "players"
                            ? "Players"
                            : key === "locked"
                              ? "Status"
                              : undefined
                        }
                      >
                        <button
                          type="button"
                          className={cn(
                            "inline-flex w-full items-center hover:text-bsc-red",
                            align === "text-center" && "justify-center",
                            align === "text-left" && "justify-start"
                          )}
                          onClick={() => changeTeamSort(key)}
                        >
                          {key === "locked" ? (
                            <Lock className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            sortLabel(key, label)
                          )}
                          {key === "locked" ? (
                            <span className="sr-only">{sortLabel(key, "Status")}</span>
                          ) : null}
                        </button>
                      </th>
                    ))}
                    <th className="px-2.5 py-2 text-center font-semibold align-bottom">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagedFantasyTeams.map((t) => {
                    const isLocked = t.effectivelyLocked === true;
                    const created = formatDateTime(t.createdAt);
                    const updated = formatDateTime(t.updatedAt);
                    return (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="px-2.5 py-2 text-left align-middle font-semibold">
                          <span className="block truncate" title={t.teamName ?? "Untitled"}>
                            {t.teamName ?? "Untitled"}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-left align-middle">
                          <span
                            className="block truncate"
                            title={t.ownerDisplayName ?? "Manager"}
                          >
                            {t.ownerDisplayName ?? "Manager"}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-left align-middle text-muted-foreground">
                          <span
                            className="block truncate"
                            title={t.ownerEmail ?? undefined}
                          >
                            {t.ownerEmail ?? "—"}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle tabular-nums">
                          {(t.playerIds ?? []).length}
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle font-semibold tabular-nums">
                          {t.budgetUsed}
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle tabular-nums">
                          {t.budgetUnused ?? "—"}
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle font-semibold tabular-nums">
                          {t.fantasyPoints.toFixed(1)}
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle text-muted-foreground">
                          <span className="block leading-tight tabular-nums">
                            {created.time ? (
                              <span className="block">{created.time}</span>
                            ) : null}
                            <span
                              className={cn(
                                "block text-[11px] opacity-80",
                                !created.time && "text-sm opacity-100"
                              )}
                            >
                              {created.date}
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle text-muted-foreground">
                          <span className="block leading-tight tabular-nums">
                            {updated.time ? (
                              <span className="block">{updated.time}</span>
                            ) : null}
                            <span
                              className={cn(
                                "block text-[11px] opacity-80",
                                !updated.time && "text-sm opacity-100"
                              )}
                            >
                              {updated.date}
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center align-middle">
                          <span
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-full border",
                              isLocked
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            )}
                            title={
                              teamsLockedGlobal
                                ? "Locked by global lock"
                                : t.locked
                                  ? "Individually locked"
                                  : "Unlocked"
                            }
                          >
                            {isLocked ? (
                              <Lock className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" aria-hidden />
                            )}
                            <span className="sr-only">
                              {isLocked ? "Locked" : "Unlocked"}
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-2 align-middle">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              asChild
                              size="icon"
                              variant="outline"
                              className="size-7"
                              title="View team"
                            >
                              <Link href={`/t/${tournamentId}/teams/${t.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                                <span className="sr-only">View</span>
                              </Link>
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-7"
                              disabled={busy}
                              title={t.locked ? "Unlock team" : "Lock team"}
                              onClick={() => void setTeamLocked(t.id, !t.locked)}
                            >
                              {t.locked ? (
                                <LockOpen className="h-3.5 w-3.5" />
                              ) : (
                                <Lock className="h-3.5 w-3.5" />
                              )}
                              <span className="sr-only">
                                {t.locked ? "Unlock" : "Lock"}
                              </span>
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-7 text-destructive hover:text-destructive"
                              disabled={busy}
                              title="Delete team"
                              onClick={() =>
                                void deleteTeam(t.id, t.teamName ?? "Untitled")
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagedFantasyTeams.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        {fantasyTeams.length === 0
                          ? "No fantasy teams yet."
                          : "No teams match your search and filters."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {visibleFantasyTeams.length === 0
                  ? `Showing 0 of ${fantasyTeams.length} teams.`
                  : `Showing ${(safeTeamPage - 1) * TEAM_PAGE_SIZE + 1}–${Math.min(
                      safeTeamPage * TEAM_PAGE_SIZE,
                      visibleFantasyTeams.length
                    )} of ${visibleFantasyTeams.length} teams${
                      visibleFantasyTeams.length !== fantasyTeams.length
                        ? ` (filtered from ${fantasyTeams.length})`
                        : ""
                    }.`}
              </p>
              {visibleFantasyTeams.length > TEAM_PAGE_SIZE ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    disabled={safeTeamPage <= 1}
                    onClick={() => setTeamPage((p) => Math.max(1, p - 1))}
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous</span>
                  </Button>
                  <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
                    Page {safeTeamPage} of {teamPageCount}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    disabled={safeTeamPage >= teamPageCount}
                    onClick={() =>
                      setTeamPage((p) => Math.min(teamPageCount, p + 1))
                    }
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              {analytics
                ? `${analytics.fantasyTeamCount} teams · ${analytics.lockedCount} individually locked`
                : "Loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold mb-1">Most used players</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  How many fantasy teams rostered each player.
                </p>
                <ul className="space-y-1.5 text-sm">
                  {(analytics?.mostUsedPlayers ?? []).length === 0 ? (
                    <li className="text-muted-foreground">No rostered players yet.</li>
                  ) : (
                    (analytics?.mostUsedPlayers ?? []).map((p) => (
                      <li
                        key={p.playerId}
                        className="flex justify-between gap-2 items-baseline"
                      >
                        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{p.displayName}</span>
                          <FantasyValueMention value={p.fantasyValue} />
                        </span>
                        <span className="tabular-nums font-semibold shrink-0 text-muted-foreground">
                          {p.teamCount} team{p.teamCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="font-bold mb-1">Most valuable player</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Highest live Fantasy Pts, with their Fantasy Value.
                  </p>
                  {analytics?.mostValuablePlayer ? (
                    <div className="rounded-xl border bg-muted/30 px-4 py-3 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-lg">
                          {analytics.mostValuablePlayer.displayName}
                        </span>
                        <FantasyValueMention
                          value={analytics.mostValuablePlayer.fantasyValue}
                        />
                      </div>
                      <div className="text-sm tabular-nums">
                        <span className="font-black text-bsc-red">
                          {analytics.mostValuablePlayer.fantasyPoints.toFixed(1)}
                        </span>{" "}
                        <span className="text-muted-foreground">Fantasy Pts</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · on {analytics.mostValuablePlayer.teamCount} team
                          {analytics.mostValuablePlayer.teamCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No player data yet.</p>
                  )}
                </div>

                <div>
                  <h3 className="font-bold mb-1">Avg Fantasy Pts by Fantasy Value</h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Average live Fantasy Pts for every player priced at that Value.
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {(analytics?.avgPointsByFantasyValue ?? []).length === 0 ? (
                      <li className="text-muted-foreground">
                        No Fantasy Values set yet.
                      </li>
                    ) : (
                      (analytics?.avgPointsByFantasyValue ?? []).map((row) => (
                        <li
                          key={row.fantasyValue}
                          className="flex justify-between gap-2 items-baseline"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <FantasyValueMention value={row.fantasyValue} />
                            <span className="text-xs text-muted-foreground">
                              ({row.playerCount} player
                              {row.playerCount === 1 ? "" : "s"})
                            </span>
                          </span>
                          <span className="tabular-nums font-semibold shrink-0">
                            {row.averageFantasyPoints.toFixed(1)} pts avg
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-1">Stat leaders (fantasy teams)</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Which fantasy team has the most of each tracked fantasy stat.
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Stat</th>
                      <th className="px-3 py-2.5 font-semibold">Fantasy team</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.statLeaders ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          No fantasy teams or stats yet.
                        </td>
                      </tr>
                    ) : (
                      (analytics?.statLeaders ?? []).map((row) => (
                        <tr key={row.field} className="border-t">
                          <td className="px-3 py-2.5 font-semibold">
                            <span
                              className="inline-flex items-center gap-1.5"
                              style={row.color ? { color: row.color } : undefined}
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: row.color ?? "currentColor",
                                }}
                                aria-hidden
                              />
                              {row.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 truncate">
                            {row.teamName ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                            {row.total}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>

        {message ? <p className="text-sm font-medium">{message}</p> : null}
        <p className="text-xs text-muted-foreground">
          {livePlayers.length} live player rows available for pool selection.
        </p>
      </main>
    </FantasyShell>
  );
}
