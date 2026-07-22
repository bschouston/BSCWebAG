"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STANDINGS_CONFIG,
  STANDINGS_CRITERION_LABELS,
  type StandingsConfig,
  type StandingsCriterionId,
  type StandingsPoints,
  type StandingsRow,
  rankStandings,
  resolveStandingsConfig,
} from "@bsc/shared";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeamRow = { id: string; name: string };
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
};

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
  const [teamStats, setTeamStats] = useState<TeamStatsRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const [tRes, statsRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`, { headers }),
        fetch(`/api/tournaments/${tournamentId}/stats`, { headers }),
      ]);
      const tData = await tRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tData?.error ?? "Failed to load tournament");
      if (!statsRes.ok) throw new Error(statsData?.error ?? "Failed to load stats");

      const cfg = resolveStandingsConfig(tData?.tournament?.standingsConfig);
      setPoints({ ...cfg.points });
      setSortCriteria([...cfg.sortCriteria]);
      setManualOrder(cfg.manualOrder ? [...cfg.manualOrder] : null);

      setTeams(
        (statsData.teams ?? []).map((t: { id: string; name?: string }) => ({
          id: t.id,
          name: t.name ?? t.id,
        }))
      );
      setTeamStats(
        (statsData.teamStats ?? []).map((s: TeamStatsRow & { id: string }) => ({
          ...s,
          id: s.id,
        }))
      );
      setMatches((statsData.matches ?? []) as MatchRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, tournamentId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const previewRows: StandingsRow[] = useMemo(() => {
    const configForPreview: StandingsConfig = {
      points,
      sortCriteria,
      // While editing: if user reordered, use that; else use saved manualOrder (unless cleared by points/criteria change)
      manualOrder,
    };
    return rankStandings({
      teams,
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
  }, [teams, teamStats, matches, points, sortCriteria, manualOrder]);

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

  return (
    <div className="space-y-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Tournament points</CardTitle>
          <CardDescription>
            Points awarded from completed matches. Win in 2 sets is a 2–0 result; win in 3 sets is
            2–1.
          </CardDescription>
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
                  ["loss", "Loss"],
                  ["tie", "Tie"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`pts-${key}`}>{label}</Label>
                  <Input
                    id={`pts-${key}`}
                    type="number"
                    value={points[key]}
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
          <CardTitle>Ranking criteria</CardTitle>
          <CardDescription>
            Order matters. Teams are compared by the first criterion, then ties break with the next,
            and so on.
          </CardDescription>
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
                      disabled={index === 0}
                      onClick={() => moveCriterion(index, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === sortCriteria.length - 1}
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
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || !manualOrder}
                onClick={resetToAuto}
              >
                Reset to auto ranking
              </Button>
              <Button type="button" size="sm" disabled={loading || saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save standings settings"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive mb-3">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : previewRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="px-3 py-2 font-medium w-20">Order</th>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium text-center">W</th>
                    <th className="px-3 py-2 font-medium text-center">L</th>
                    <th className="px-3 py-2 font-medium text-center">Tourney Pts</th>
                    <th className="px-3 py-2 font-medium text-center">Sets +/-</th>
                    <th className="px-3 py-2 font-medium text-center">Pts +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={row.teamId} className={index % 2 ? "bg-muted/20" : undefined}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={index === 0}
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
                            disabled={index === previewRows.length - 1}
                            onClick={() => movePreviewTeam(index, 1)}
                            aria-label="Move team down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.wins}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.losses}</td>
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
