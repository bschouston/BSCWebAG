"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STANDINGS_CONFIG,
  STANDINGS_CRITERION_LABELS,
  filterTeamsForStandingsScope,
  isSavedPlayoffBracket,
  type StandingsConfig,
  type StandingsCriterionId,
  type StandingsPoints,
  type StandingsRow,
  type StandingsScope,
  rankStandings,
  resolveStandingsConfig,
} from "@bsc/shared";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TeamRow = { id: string; name: string; divisionId?: string | null };
type DivisionRow = { id: string; name: string };
type TeamStatsRow = {
  id: string;
  wins?: number;
  losses?: number;
  setsWon?: number;
  setsLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
};
type MatchRow = {
  id: string;
  status: string;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string | null;
  phase?: string;
};

type ScopeKey = "all" | "unassigned" | string;

function scopeFromKey(key: ScopeKey): StandingsScope {
  if (key === "all") return { type: "all" };
  if (key === "unassigned") return { type: "unassigned" };
  return { type: "division", divisionId: key };
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function StandingsConfigPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [points, setPoints] = useState<StandingsPoints>({ ...DEFAULT_STANDINGS_CONFIG.points });
  const [sortCriteria, setSortCriteria] = useState<StandingsCriterionId[]>([
    ...DEFAULT_STANDINGS_CONFIG.sortCriteria,
  ]);
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [scopeKey, setScopeKey] = useState<ScopeKey>("all");
  const [playoffsLocked, setPlayoffsLocked] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const [tRes, statsRes, divRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`, { headers }),
        fetch(`/api/tournaments/${tournamentId}/stats`, { headers }),
        fetch(`/api/tournaments/${tournamentId}/divisions`, { headers }),
      ]);
      const tData = await tRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));
      const divData = await divRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tData?.error ?? "Failed to load tournament");
      if (!statsRes.ok) throw new Error(statsData?.error ?? "Failed to load stats");
      if (!divRes.ok) throw new Error(divData?.error ?? "Failed to load divisions");

      const cfg = resolveStandingsConfig(tData?.tournament?.standingsConfig);
      setPoints({ ...cfg.points });
      setSortCriteria([...cfg.sortCriteria]);
      setManualOrder(cfg.manualOrder ? [...cfg.manualOrder] : null);

      setTeams(
        (statsData.teams ?? []).map(
          (t: { id: string; name?: string; divisionId?: string | null }) => ({
            id: t.id,
            name: t.name ?? t.id,
            divisionId: t.divisionId ?? null,
          })
        )
      );
      setDivisions(
        (divData.divisions ?? []).map((d: { id: string; name?: string }) => ({
          id: d.id,
          name: d.name ?? d.id,
        }))
      );
      setTeamStats(
        (statsData.teamStats ?? []).map((s: TeamStatsRow & { id: string }) => ({
          ...s,
          id: s.id,
        }))
      );
      const loadedMatches = (statsData.matches ?? []) as MatchRow[];
      setMatches(loadedMatches);
      const hasPlayoffMatches = loadedMatches.some((m) => m.phase === "PLAYOFF");
      setPlayoffsLocked(
        isSavedPlayoffBracket(tData?.tournament?.playoffBracket) || hasPlayoffMatches
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, tournamentId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const showDivisionScopes = divisions.length > 1;
  const hasUnassigned = useMemo(
    () => teams.some((t) => !t.divisionId),
    [teams]
  );

  useEffect(() => {
    if (!showDivisionScopes) {
      setScopeKey("all");
      return;
    }
    if (scopeKey === "unassigned" && !hasUnassigned) {
      setScopeKey("all");
      return;
    }
    if (
      scopeKey !== "all" &&
      scopeKey !== "unassigned" &&
      !divisions.some((d) => d.id === scopeKey)
    ) {
      setScopeKey("all");
    }
  }, [showDivisionScopes, hasUnassigned, divisions, scopeKey]);

  const canReorder = !showDivisionScopes || scopeKey === "all";

  const previewRows: StandingsRow[] = useMemo(() => {
    const scope = showDivisionScopes ? scopeFromKey(scopeKey) : { type: "all" as const };
    const scopedTeams = filterTeamsForStandingsScope(teams, scope);
    const configForPreview: StandingsConfig = {
      points,
      sortCriteria,
      // Manual order only applies in All scope (global list).
      manualOrder: canReorder ? manualOrder : null,
    };
    return rankStandings({
      teams: scopedTeams.map((t) => ({ id: t.id, name: t.name })),
      teamStats: teamStats.map((s) => ({
        teamId: s.id,
        wins: s.wins,
        losses: s.losses,
        setsWon: s.setsWon,
        setsLost: s.setsLost,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
      })),
      matches,
      config: configForPreview,
    });
  }, [
    teams,
    teamStats,
    matches,
    points,
    sortCriteria,
    manualOrder,
    showDivisionScopes,
    scopeKey,
    canReorder,
  ]);

  const setPointField = (key: keyof StandingsPoints, raw: string) => {
    const value = Number(raw);
    setPoints((prev) => ({
      ...prev,
      [key]: Number.isFinite(value) ? value : prev[key],
    }));
    // Changing points clears manual override
    setManualOrder(null);
  };

  const moveCriterion = (index: number, dir: -1 | 1) => {
    setSortCriteria((prev) => moveItem(prev, index, index + dir));
    setManualOrder(null);
  };

  const movePreviewTeam = (index: number, dir: -1 | 1) => {
    if (!canReorder) return;
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= previewRows.length) return;
    const ids = previewRows.map((r) => r.teamId);
    const reordered = moveItem(ids, index, nextIndex);
    setManualOrder(reordered);
  };

  const resetToAuto = () => {
    setManualOrder(null);
  };

  const save = async () => {
    if (playoffsLocked) {
      setError(
        "Standings are locked while playoffs are active — delete playoffs to edit standings"
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: StandingsConfig = {
        points,
        sortCriteria,
        manualOrder: manualOrder && manualOrder.length > 0 ? manualOrder : null,
      };
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ standingsConfig: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to save");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const scopeButtons: { key: ScopeKey; label: string }[] = [
    { key: "all", label: "All" },
    ...divisions.map((d) => ({ key: d.id, label: d.name })),
    ...(hasUnassigned ? [{ key: "unassigned" as const, label: "Unassigned" }] : []),
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      {playoffsLocked && !loading ? (
        <p className="text-sm text-amber-800 dark:text-amber-300 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          Standings are locked because playoffs are active (seeding uses this order). Delete
          playoffs on the Playoffs tab to edit points, criteria, or team order again.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Tournament points</CardTitle>
              <CardDescription>
                Points awarded from completed matches (no ties). Win/loss in 2 sets is a 2–0
                result; win/loss in 3 sets is 2–1. Save to apply the scheme to public standings
                (preview below updates as you edit).
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={loading || saving || playoffsLocked}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save points settings"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["winIn2Sets", "Win in 2 sets"],
                  ["winIn3Sets", "Win in 3 sets"],
                  ["lossIn2Sets", "Loss in 2 sets"],
                  ["lossIn3Sets", "Loss in 3 sets"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`pts-${key}`}>{label}</Label>
                  <Input
                    id={`pts-${key}`}
                    type="number"
                    value={points[key]}
                    disabled={playoffsLocked}
                    onChange={(e) => setPointField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Ranking criteria</CardTitle>
              <CardDescription>
                Order matters. Teams are compared by the first criterion, then ties break with the next,
                and so on.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={loading || saving || playoffsLocked}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save standings settings"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {sortCriteria.map((id, index) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="text-sm font-medium">
                    <span className="text-muted-foreground tabular-nums mr-2">{index + 1}.</span>
                    {STANDINGS_CRITERION_LABELS[id]}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={playoffsLocked || index === 0}
                      onClick={() => moveCriterion(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={playoffsLocked || index === sortCriteria.length - 1}
                      onClick={() => moveCriterion(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Standings preview</CardTitle>
              <CardDescription>
                Live preview from current matches and stats. Reorder teams to publish a custom
                order; changing points or criteria clears a custom order.
                {manualOrder ? (
                  <span className="block mt-1 text-amber-700 dark:text-amber-400 font-medium">
                    Custom order active — will be used on the public standings page when saved.
                  </span>
                ) : null}
                {showDivisionScopes && !canReorder ? (
                  <span className="block mt-1 text-muted-foreground">
                    Custom reorder is only available when viewing All teams.
                  </span>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || playoffsLocked || !manualOrder}
                onClick={resetToAuto}
              >
                Reset to auto ranking
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading || saving || playoffsLocked}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save standings settings"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive mb-3">{error}</p> : null}
          {showDivisionScopes && !loading ? (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {scopeButtons.map((b) => (
                <Button
                  key={b.key}
                  type="button"
                  size="sm"
                  variant={scopeKey === b.key ? "default" : "outline"}
                  className={cn(scopeKey === b.key && "pointer-events-none")}
                  onClick={() => setScopeKey(b.key)}
                >
                  {b.label}
                </Button>
              ))}
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : previewRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    {canReorder ? (
                      <th className="px-3 py-2 font-medium w-20">Order</th>
                    ) : null}
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium text-center">W</th>
                    <th className="px-3 py-2 font-medium text-center">L</th>
                    <th className="px-3 py-2 font-medium text-center" title="Wins in 2 sets (e.g. 2–0)">
                      W in 2
                    </th>
                    <th className="px-3 py-2 font-medium text-center" title="Wins in 3 sets (e.g. 2–1)">
                      W in 3
                    </th>
                    <th className="px-3 py-2 font-medium text-center">Tourney Pts</th>
                    <th className="px-3 py-2 font-medium text-center">Sets +/-</th>
                    <th className="px-3 py-2 font-medium text-center">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={row.teamId} className={index % 2 ? "bg-muted/20" : undefined}>
                      {canReorder ? (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={playoffsLocked || index === 0}
                              onClick={() => movePreviewTeam(index, -1)}
                              aria-label="Move team up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={playoffsLocked || index === previewRows.length - 1}
                              onClick={() => movePreviewTeam(index, 1)}
                              aria-label="Move team down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.losses}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.winsIn2Sets}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.winsIn3Sets}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold">
                        {row.tournamentPoints}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {row.setDifferential > 0 ? "+" : ""}
                        {row.setDifferential}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {row.pointDifferential > 0 ? "+" : ""}
                        {row.pointDifferential}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
