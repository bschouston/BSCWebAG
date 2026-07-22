"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLAYOFF_CONFIG,
  MIN_PLAYOFF_TEAMS,
  buildPlayoffStructureWithReseed,
  defaultReseedRoundKeys,
  generateDoubleEliminationBracket,
  listReseedableRounds,
  rankStandings,
  resolvePlayoffConfig,
  resolveStandingsConfig,
  type PlayoffBracketDoc,
  type PlayoffBracketStructure,
  type PlayoffConfig,
  type PlayoffTeamInput,
} from "@bsc/shared";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PlayoffBracketPreview } from "@/components/admin/playoff-bracket-previews";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Friendly presets for single-elim merge threshold (stored as remaining fraction). */
const MERGE_REMAINING_PRESETS = [
  { id: "33", label: "33% of field remaining (default)", fraction: 1 / 3 },
  { id: "50", label: "50% of field remaining", fraction: 0.5 },
  { id: "67", label: "67% of field remaining", fraction: 2 / 3 },
  { id: "75", label: "75% of field remaining", fraction: 0.75 },
  { id: "80", label: "80% of field remaining", fraction: 0.8 },
  { id: "90", label: "90% of field remaining", fraction: 0.9 },
] as const;

function mergePresetIdFromFraction(fraction: number): string {
  let best: (typeof MERGE_REMAINING_PRESETS)[number] = MERGE_REMAINING_PRESETS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of MERGE_REMAINING_PRESETS) {
    const dist = Math.abs(p.fraction - fraction);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best.id;
}

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
  phase?: string;
  bracketMatchId?: string;
  courtNumber?: number;
  scheduledAt?: string | null;
};

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function PlayoffsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<PlayoffConfig>({
    ...DEFAULT_PLAYOFF_CONFIG,
    reseedRoundKeys: [],
  });
  const [seedTeams, setSeedTeams] = useState<PlayoffTeamInput[]>([]);
  const [structure, setStructure] = useState<PlayoffBracketStructure | null>(null);
  const [baseStructure, setBaseStructure] = useState<PlayoffBracketStructure | null>(null);
  const [hasSavedBracket, setHasSavedBracket] = useState(false);
  const [reseedDirty, setReseedDirty] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [selectedRoundKeys, setSelectedRoundKeys] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publishedPlayoffs, setPublishedPlayoffs] = useState<
    { bracketMatchId: string; courtNumber?: number | null; scheduledAt?: string | null }[]
  >([]);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [standingsConfigRaw, setStandingsConfigRaw] = useState<unknown>(undefined);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const rebuildFromSeeds = useCallback(
    (seeds: PlayoffTeamInput[], cfg: PlayoffConfig) => {
      if (seeds.length < MIN_PLAYOFF_TEAMS) {
        setStructure(null);
        setBaseStructure(null);
        return;
      }
      try {
        const built = generateDoubleEliminationBracket({
          teams: seeds,
          mergeRemainingFraction: cfg.mergeRemainingFraction,
        });
        setBaseStructure(built);
        setStructure(
          buildPlayoffStructureWithReseed(built, cfg.reseedEnabled, cfg.reseedRoundKeys)
        );
        setError(null);
      } catch (err) {
        setStructure(null);
        setBaseStructure(null);
        setError(err instanceof Error ? err.message : "Failed to build bracket");
      }
    },
    []
  );

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

      const cfg = resolvePlayoffConfig(tData?.tournament?.playoffConfig);
      setConfig(cfg);
      setStandingsConfigRaw(tData?.tournament?.standingsConfig);

      const loadedTeams = (statsData.teams ?? []).map((t: { id: string; name?: string }) => ({
        id: t.id,
        name: t.name ?? t.id,
      }));
      setTeams(loadedTeams);
      setTeamStats(
        (statsData.teamStats ?? []).map((s: TeamStatsRow & { id: string }) => ({
          ...s,
          id: s.id,
        }))
      );
      setMatches((statsData.matches ?? []) as MatchRow[]);
      const published = ((statsData.matches ?? []) as MatchRow[])
        .filter((m) => m.phase === "PLAYOFF" && m.bracketMatchId)
        .map((m) => ({
          bracketMatchId: String(m.bracketMatchId),
          courtNumber: m.courtNumber ?? null,
          scheduledAt: m.scheduledAt ?? null,
        }));
      setPublishedPlayoffs(published);

      const saved: PlayoffBracketDoc | null = tData?.tournament?.playoffBracket ?? null;
      if (saved?.seeds?.length && saved.structure) {
        setHasSavedBracket(true);
        const nameById = new Map(loadedTeams.map((t: TeamRow) => [t.id, t.name]));
        const seeds: PlayoffTeamInput[] = saved.seeds.map((s) => ({
          teamId: s.teamId,
          name: String(s.name ?? nameById.get(s.teamId) ?? s.teamId),
        }));
        setSeedTeams(seeds);
        // Rebuild base + apply saved reseed so preview matches config
        try {
          const built = generateDoubleEliminationBracket({
            teams: seeds,
            mergeRemainingFraction: cfg.mergeRemainingFraction,
          });
          setBaseStructure(built);
          setStructure(
            buildPlayoffStructureWithReseed(built, cfg.reseedEnabled, cfg.reseedRoundKeys)
          );
        } catch {
          setBaseStructure(null);
          setStructure(saved.structure);
        }
        setReseedDirty(false);
      } else {
        setHasSavedBracket(false);
        setSeedTeams([]);
        setStructure(null);
        setBaseStructure(null);
        setReseedDirty(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, tournamentId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const standingsOrdered = useMemo(() => {
    return rankStandings({
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
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
      config: resolveStandingsConfig(standingsConfigRaw),
    });
  }, [teams, teamStats, matches, standingsConfigRaw]);

  const maxPlayoffTeams = Math.max(teams.length, standingsOrdered.length);
  const playoffTeamOptions = useMemo(() => {
    const max = Math.max(maxPlayoffTeams, MIN_PLAYOFF_TEAMS);
    const opts: number[] = [];
    for (let n = MIN_PLAYOFF_TEAMS; n <= max; n++) opts.push(n);
    return opts;
  }, [maxPlayoffTeams]);

  // Keep selected count within the available range once teams load.
  useEffect(() => {
    if (loading || playoffTeamOptions.length === 0) return;
    if (!playoffTeamOptions.includes(config.playoffTeams)) {
      const clamped = playoffTeamOptions.includes(DEFAULT_PLAYOFF_CONFIG.playoffTeams)
        ? DEFAULT_PLAYOFF_CONFIG.playoffTeams
        : playoffTeamOptions[playoffTeamOptions.length - 1];
      setConfig((prev) => ({ ...prev, playoffTeams: clamped }));
    }
  }, [loading, playoffTeamOptions, config.playoffTeams]);

  const mergeHint = useMemo(() => {
    const n = Math.max(config.playoffTeams, MIN_PLAYOFF_TEAMS);
    const eliminatedFraction = 1 - config.mergeRemainingFraction;
    const eliminationThreshold = Math.max(1, Math.ceil(n * eliminatedFraction));
    const remaining = Math.max(1, n - eliminationThreshold);
    const pct = Math.round(config.mergeRemainingFraction * 100);
    return `Single elimination threshold for ${n} teams: switch after ~${eliminationThreshold} elimination(s) (~${remaining} team(s) left, ${pct}% of the field).`;
  }, [config.mergeRemainingFraction, config.playoffTeams]);

  const generateFromStandings = () => {
    const n = Math.min(config.playoffTeams, standingsOrdered.length);
    if (n < MIN_PLAYOFF_TEAMS) {
      setError(
        `Need at least ${MIN_PLAYOFF_TEAMS} teams in standings (have ${standingsOrdered.length}).`
      );
      setStructure(null);
      setSeedTeams([]);
      return;
    }
    const seeds: PlayoffTeamInput[] = standingsOrdered.slice(0, n).map((row) => ({
      teamId: row.teamId,
      name: row.name,
    }));
    setSeedTeams(seeds);
    rebuildFromSeeds(seeds, config);
  };

  const moveSeed = (index: number, dir: -1 | 1) => {
    const next = moveItem(seedTeams, index, index + dir);
    if (next === seedTeams) return;
    setSeedTeams(next);
    rebuildFromSeeds(next, config);
  };

  const updateConfigField = <K extends keyof PlayoffConfig>(key: K, value: PlayoffConfig[K]) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    if (seedTeams.length >= MIN_PLAYOFF_TEAMS) {
      rebuildFromSeeds(seedTeams, next);
    }
  };

  const reseedableRounds = useMemo(
    () => (baseStructure ? listReseedableRounds(baseStructure) : []),
    [baseStructure]
  );

  const setReseedEnabled = (enabled: boolean) => {
    if (!baseStructure && seedTeams.length < MIN_PLAYOFF_TEAMS) {
      setConfig((prev) => ({
        ...prev,
        reseedEnabled: enabled,
        reseedRoundKeys: enabled ? prev.reseedRoundKeys : [],
      }));
      setReseedDirty(true);
      return;
    }
    const built =
      baseStructure ??
      (seedTeams.length >= MIN_PLAYOFF_TEAMS
        ? generateDoubleEliminationBracket({
            teams: seedTeams,
            mergeRemainingFraction: config.mergeRemainingFraction,
          })
        : null);
    if (!built) {
      setConfig((prev) => ({ ...prev, reseedEnabled: enabled, reseedRoundKeys: [] }));
      setReseedDirty(true);
      return;
    }
    const next: PlayoffConfig = {
      ...config,
      reseedEnabled: enabled,
      reseedRoundKeys: enabled ? defaultReseedRoundKeys(built) : [],
    };
    setConfig(next);
    setReseedDirty(true);
    rebuildFromSeeds(seedTeams, next);
  };

  const toggleReseedRound = (key: string, checked: boolean) => {
    const keys = new Set(config.reseedRoundKeys);
    if (checked) keys.add(key);
    else keys.delete(key);
    const next: PlayoffConfig = {
      ...config,
      reseedEnabled: true,
      reseedRoundKeys: [...keys],
    };
    setConfig(next);
    setReseedDirty(true);
    if (seedTeams.length >= MIN_PLAYOFF_TEAMS) {
      rebuildFromSeeds(seedTeams, next);
    }
  };

  const persistBracket = async (): Promise<boolean> => {
    if (!structure || seedTeams.length < MIN_PLAYOFF_TEAMS) {
      setError("Generate a bracket before saving.");
      return false;
    }
    const payload: PlayoffBracketDoc = {
      generatedAt: new Date().toISOString(),
      seeds: seedTeams.map((t, i) => ({
        teamId: t.teamId,
        seed: i + 1,
        name: t.name,
      })),
      structure,
    };
    const headers = await authHeaders();
    const res = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        playoffConfig: {
          ...config,
          reseedRoundKeys: config.reseedEnabled ? config.reseedRoundKeys : [],
        },
        playoffBracket: payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to save");
    setHasSavedBracket(true);
    setReseedDirty(false);
    return true;
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const ok = await persistBracket();
      if (ok) await load();
      return ok;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clearBracket = async () => {
    if (
      !window.confirm(
        "Delete playoffs, all published playoff schedule matches, and reseed round settings?\n\nReseed rounds will be turned off (default). This is all-or-nothing: if any playoff match has progress, plays, or an active tracker lock, nothing will be deleted until those issues are resolved first."
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/playoffs/clear`, {
        method: "POST",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          Array.isArray(data?.blockers) && data.blockers.length
            ? `${data.error ?? "Cannot clear playoff bracket"}: ${data.blockers.join("; ")}`
            : (data?.error ?? "Failed to clear");
        throw new Error(detail);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  const generateNext = async () => {
    const matchIds = [...selectedMatchIds];
    const roundKeys = [...selectedRoundKeys];
    if (matchIds.length === 0 && roundKeys.length === 0) {
      setError("Select at least one match or round.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      if (!hasSavedBracket || reseedDirty) {
        await persistBracket();
      }
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/playoffs/generate-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ matchIds, roundKeys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate matches");
      setSelectedMatchIds([]);
      setSelectedRoundKeys([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate matches");
    } finally {
      setGenerating(false);
    }
  };

  const activeReseedRoundKeys = useMemo(() => {
    if (!config.reseedEnabled) return [];
    return config.reseedRoundKeys;
  }, [config.reseedEnabled, config.reseedRoundKeys]);

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Playoff configuration</CardTitle>
          <CardDescription>
            Hybrid double elimination (ported from the Sheets schedule maker). Seeds default to
            current standings order; reorder after generating if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Bracket type</Label>
                  <Input value="Double Elimination" disabled />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="playoff-teams">Playoff teams</Label>
                  <Select
                    value={String(config.playoffTeams)}
                    onValueChange={(v) => updateConfigField("playoffTeams", Number(v))}
                    disabled={maxPlayoffTeams < MIN_PLAYOFF_TEAMS}
                  >
                    <SelectTrigger id="playoff-teams">
                      <SelectValue placeholder="Select team count" />
                    </SelectTrigger>
                    <SelectContent>
                      {playoffTeamOptions.map((n) => (
                        <SelectItem key={n} value={String(n)} disabled={n > maxPlayoffTeams}>
                          {n} teams
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {maxPlayoffTeams < MIN_PLAYOFF_TEAMS ? (
                    <p className="text-xs text-muted-foreground">
                      Need at least {MIN_PLAYOFF_TEAMS} teams in the tournament.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Choose from {MIN_PLAYOFF_TEAMS} up to {maxPlayoffTeams} (teams in this
                      tournament).
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="merge-frac">Single elimination threshold</Label>
                  <Select
                    value={mergePresetIdFromFraction(config.mergeRemainingFraction)}
                    onValueChange={(id) => {
                      const preset = MERGE_REMAINING_PRESETS.find((p) => p.id === id);
                      if (preset) updateConfigField("mergeRemainingFraction", preset.fraction);
                    }}
                  >
                    <SelectTrigger id="merge-frac">
                      <SelectValue placeholder="Select threshold" />
                    </SelectTrigger>
                    <SelectContent>
                      {MERGE_REMAINING_PRESETS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{mergeHint}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="playoff-date">Playoff date</Label>
                  <Input
                    id="playoff-date"
                    type="date"
                    value={config.scheduleDate ?? ""}
                    onChange={(e) => updateConfigField("scheduleDate", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="playoff-start">Start time</Label>
                  <Input
                    id="playoff-start"
                    type="time"
                    value={config.startTime ?? "09:00"}
                    onChange={(e) => updateConfigField("startTime", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="playoff-duration">Match duration (min)</Label>
                  <Input
                    id="playoff-duration"
                    type="number"
                    min={1}
                    value={config.matchDurationMinutes ?? 30}
                    onChange={(e) =>
                      updateConfigField("matchDurationMinutes", Math.max(1, Number(e.target.value) || 30))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="playoff-courts">Courts</Label>
                  <Input
                    id="playoff-courts"
                    type="number"
                    min={1}
                    value={config.numberOfCourts ?? 2}
                    onChange={(e) =>
                      updateConfigField("numberOfCourts", Math.max(1, Number(e.target.value) || 2))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={generateFromStandings}
                  disabled={loading || saving || hasSavedBracket}
                >
                  Generate Playoffs
                </Button>
                <Button
                  type="button"
                  disabled={
                    loading ||
                    saving ||
                    !structure ||
                    (hasSavedBracket && !reseedDirty)
                  }
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save Playoffs"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading || saving || !hasSavedBracket}
                  onClick={() => void clearBracket()}
                >
                  Delete Playoffs
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {seedTeams.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Seed order</CardTitle>
            <CardDescription>
              Drag with up/down to change seeding. Bracket preview updates immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {seedTeams.map((t, index) => (
                <li
                  key={t.teamId}
                  className="flex items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="text-sm font-medium">
                    <span className="text-muted-foreground tabular-nums mr-2">#{index + 1}</span>
                    {t.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => moveSeed(index, -1)}
                      aria-label="Move seed up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === seedTeams.length - 1}
                      onClick={() => moveSeed(index, 1)}
                      aria-label="Move seed down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bracket preview</CardTitle>
          <CardDescription>
            {structure
              ? `Merge after winners R${structure.mergeAfterWinnersRound} · ${structure.eliminationThreshold} elim threshold`
              : "Generate Playoffs to preview rounds."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!structure ? (
            <p className="text-sm text-muted-foreground">No bracket yet.</p>
          ) : (
            <>
              <div className="space-y-3 rounded-md border p-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={config.reseedEnabled}
                    onCheckedChange={(v) => setReseedEnabled(v === true)}
                  />
                  Reseed rounds
                </label>
                <p className="text-xs text-muted-foreground">
                  When enabled, checked rounds pair best remaining seed vs worst. Preview updates as
                  you toggle; use <span className="font-medium">Save Playoffs</span> above to
                  persist.
                  {reseedDirty ? (
                    <span className="block mt-1 text-amber-700 dark:text-amber-400 font-medium">
                      Unsaved reseed changes — save to publish.
                    </span>
                  ) : null}
                </p>
                {config.reseedEnabled ? (
                  <div className="grid gap-4 sm:grid-cols-2 pt-1">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-sky-800 dark:text-sky-300">
                        Winners bracket
                      </div>
                      {reseedableRounds
                        .filter((r) => r.rail === "winners" || r.rail === "final")
                        .map((r) => (
                          <label
                            key={r.key}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              checked={config.reseedRoundKeys.includes(r.key)}
                              onCheckedChange={(v) => toggleReseedRound(r.key, v === true)}
                            />
                            <span>
                              {r.label}
                              {r.isSemifinal ? (
                                <span className="text-muted-foreground"> (semifinals)</span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Losers bracket
                      </div>
                      {reseedableRounds.filter((r) => r.rail === "losers").length === 0 ? (
                        <p className="text-xs text-muted-foreground">No losers rounds.</p>
                      ) : (
                        reseedableRounds
                          .filter((r) => r.rail === "losers")
                          .map((r) => (
                            <label
                              key={r.key}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <Checkbox
                                checked={config.reseedRoundKeys.includes(r.key)}
                                onCheckedChange={(v) => toggleReseedRound(r.key, v === true)}
                              />
                              {r.label}
                            </label>
                          ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Publish matches</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Check ready matches in non-reseed rounds, and/or fully populated reseed rounds,
                      then Generate Next to schedule them as one batch. Nothing is published
                      automatically. Unsaved bracket changes are saved when you generate.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      generating ||
                      saving ||
                      (selectedMatchIds.length === 0 && selectedRoundKeys.length === 0)
                    }
                    onClick={() => void generateNext()}
                  >
                    {generating ? "Generating…" : "Generate Next"}
                  </Button>
                </div>
              </div>

              <PlayoffBracketPreview
                structure={structure}
                publishedMatches={publishedPlayoffs}
                selectionEnabled={!!structure}
                reseedRoundKeys={activeReseedRoundKeys}
                selectedMatchIds={selectedMatchIds}
                selectedRoundKeys={selectedRoundKeys}
                onSelectedMatchIdsChange={setSelectedMatchIds}
                onSelectedRoundKeysChange={setSelectedRoundKeys}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
