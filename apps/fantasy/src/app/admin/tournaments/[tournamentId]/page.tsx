"use client";

import { use, useEffect, useMemo, useState } from "react";
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
} from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { isFantasyAdminProfile, useAuth } from "@/lib/auth-context";
import { useLiveTournamentStats } from "@/lib/use-live-tournament-stats";

const ALL_TEAMS = "__all__";

type FantasyTeamRow = {
  id: string;
  teamName?: string;
  ownerDisplayName?: string;
  playerIds?: string[];
  locked?: boolean;
  effectivelyLocked?: boolean;
};

export default function FantasyAdminTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, profile, loading } = useAuth();
  const { tournamentName, livePlayers, teams } = useLiveTournamentStats(tournamentId);

  const [teamSize, setTeamSize] = useState(7);
  const [teamsLockedGlobal, setTeamsLockedGlobal] = useState(false);
  const [eligibleTeamIds, setEligibleTeamIds] = useState<string[]>([]);
  const [maxBudget, setMaxBudget] = useState("");
  const [playerValues, setPlayerValues] = useState<Record<string, string>>({});
  const [valueQuery, setValueQuery] = useState("");
  const [valueTeamFilter, setValueTeamFilter] = useState(ALL_TEAMS);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeamRow[]>([]);
  const [analytics, setAnalytics] = useState<{
    fantasyTeamCount: number;
    lockedCount: number;
    mostUsedPlayers: { displayName: string; count: number }[];
    mostUsedTeams: { name: string; count: number }[];
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

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Pool & locks</CardTitle>
            <CardDescription>
              Team size, budget, and which real teams feed the fantasy pool. Global lock freezes
              all owner edits.
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
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={teamsLockedGlobal}
                onCheckedChange={(v) => setTeamsLockedGlobal(v === true)}
              />
              Lock all fantasy teams (global)
            </label>
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

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Fantasy teams ({fantasyTeams.length})</CardTitle>
            <CardDescription>Owner emails are never shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {fantasyTeams.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 border rounded-lg px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.teamName ?? "Untitled"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.ownerDisplayName ?? "Manager"} · {(t.playerIds ?? []).length} players
                    {t.effectivelyLocked ? " · Locked" : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setTeamLocked(t.id, !t.locked)}
                >
                  {t.locked ? "Unlock" : "Lock"}
                </Button>
              </div>
            ))}
            {fantasyTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fantasy teams yet.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bsc-accent-card">
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              {analytics
                ? `${analytics.fantasyTeamCount} teams · ${analytics.lockedCount} individually locked`
                : "Loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold mb-2">Most used players</h3>
              <ul className="space-y-1 text-sm">
                {(analytics?.mostUsedPlayers ?? []).map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{p.displayName}</span>
                    <span className="tabular-nums font-semibold">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-2">Most used real teams</h3>
              <ul className="space-y-1 text-sm">
                {(analytics?.mostUsedTeams ?? []).map((t, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{t.name}</span>
                    <span className="tabular-nums font-semibold">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {message ? <p className="text-sm font-medium">{message}</p> : null}
        <p className="text-xs text-muted-foreground">
          {livePlayers.length} live player rows available for pool selection.
        </p>
      </main>
    </FantasyShell>
  );
}
