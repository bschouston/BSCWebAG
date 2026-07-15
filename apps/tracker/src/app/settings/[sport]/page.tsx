"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  statTrackers,
  applyManualScoringPolicy,
  statKeyFromLabel,
  type SetRules,
  type StatCategory,
  type TrackerColors,
  type TrackerConfig,
} from "@bsc/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@bsc/ui";
import { TrackerShell } from "@/components/tracker-shell";
import { useAuth } from "@/lib/auth-context";

type StatRow = {
  key?: string;
  label: string;
  shortLabel: string;
  category: StatCategory;
  points: number;
  showInTracker: boolean;
  enabled: boolean;
};

type StatImpact = {
  playCount: number;
  tournamentCount: number;
  matchCount: number;
  playerCount: number;
  label: string;
};

const CATEGORY_LABELS: Record<"positive" | "negative", string> = {
  positive: "Positive",
  negative: "Negative",
};

const CATEGORY_ORDER = ["positive", "negative"] as const;

export default function SportSettingsPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = use(params);
  const { user, profile, loading } = useAuth();

  const sportDef = statTrackers.find((t) => t.sport === sport);
  const isTracker =
    profile?.role === "TRACKER" || profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stats, setStats] = useState<StatRow[]>([]);
  const [colors, setColors] = useState<TrackerColors | null>(null);
  const [gridColumns, setGridColumns] = useState<2 | 3>(3);
  const [setRules, setSetRules] = useState<SetRules | null>(null);

  const [hasPasscode, setHasPasscode] = useState(false);
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [savingPasscode, setSavingPasscode] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIndex, setDeleteTargetIndex] = useState<number | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<StatImpact | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  const api = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      const token = await user?.getIdToken();
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [user]
  );

  const applyConfig = (config: TrackerConfig) => {
    const { config: normalized } = applyManualScoringPolicy(config);
    setStats(
      [...normalized.stats]
        .filter((s) => s.key !== "opponent_error")
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          key: s.key,
          label: s.label,
          shortLabel: s.shortLabel,
          category:
            s.category === "positive_scoring"
              ? "positive"
              : s.category === "negative_scoring"
                ? "negative"
                : s.category,
          points: s.points,
          showInTracker: s.showInTracker !== false && s.showInLeaderboard !== false,
          enabled: s.enabled,
        }))
    );
    setColors(config.colors);
    setGridColumns(config.layout.playerGridColumns);
    setSetRules(config.setRules);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (!isTracker || !sportDef) return;
    const run = async () => {
      setBusy(true);
      try {
        const data = await api(`/api/tracker-config/${sport}`);
        applyConfig(data.config as TrackerConfig);
        setHasPasscode(!!data.hasPasscode);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load settings");
      } finally {
        setBusy(false);
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isTracker, sport]);

  const updateStat = (index: number, patch: Partial<StatRow>) => {
    setStats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const moveStat = (index: number, dir: -1 | 1) => {
    setStats((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addStat = () => {
    setStats((prev) => [
      ...prev,
      {
        label: "",
        shortLabel: "",
        category: "positive",
        points: 1,
        showInTracker: true,
        enabled: true,
      },
    ]);
  };

  const removeStat = async (index: number) => {
    const stat = stats[index];
    if (!stat.key) {
      setStats((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    setDeleteTargetIndex(index);
    setDeleteImpact(null);
    setDeleteDialogOpen(true);
    setDeleteImpactLoading(true);
    setError(null);

    try {
      const data = (await api(
        `/api/tracker-config/${sport}/stats/${encodeURIComponent(stat.key)}/impact`
      )) as StatImpact;

      if (data.playCount === 0) {
        setDeleteDialogOpen(false);
        setDeleteTargetIndex(null);
        updateStat(index, { enabled: false });
        setNotice(`"${stat.label}" disabled. Save settings to apply.`);
        return;
      }

      setDeleteImpact(data);
    } catch (e: unknown) {
      setDeleteDialogOpen(false);
      setDeleteTargetIndex(null);
      setError(e instanceof Error ? e.message : "Failed to check stat usage");
    } finally {
      setDeleteImpactLoading(false);
    }
  };

  const confirmPurgeStat = async () => {
    const index = deleteTargetIndex;
    const stat = index != null ? stats[index] : null;
    if (!stat?.key) return;

    setPurging(true);
    setError(null);
    try {
      const data = await api(
        `/api/tracker-config/${sport}/stats/${encodeURIComponent(stat.key)}/purge`,
        { method: "POST" }
      );
      applyConfig(data.config as TrackerConfig);
      setDeleteDialogOpen(false);
      setDeleteTargetIndex(null);
      setDeleteImpact(null);
      setNotice(
        `Deleted "${stat.label}" and removed ${data.playsPurged ?? 0} recorded ${
          data.playsPurged === 1 ? "play" : "plays"
        } from ${data.tournamentsRebuilt ?? 0} ${
          data.tournamentsRebuilt === 1 ? "tournament" : "tournaments"
        }.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete stat data");
    } finally {
      setPurging(false);
    }
  };

  const validationError = useMemo(() => {
    for (const s of stats) {
      if (!s.label.trim()) return "Every stat needs a label";
      if (!s.shortLabel.trim()) return "Every stat needs a short label";
      if (!Number.isFinite(s.points)) return "Value must be a number";
    }
    if (!stats.some((s) => s.enabled)) return "At least one stat must be enabled";
    if (!stats.some((s) => s.enabled && s.showInTracker)) {
      return "At least one stat must be shown in the tracker";
    }
    return null;
  }, [stats]);

  const save = async () => {
    if (validationError || !colors || !setRules) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // When re-adding a stat with the same label as a disabled one, drop the
      // disabled row so the server reuses the immutable key/aggregateField.
      const toSave = stats.filter((s, i, arr) => {
        if (!s.enabled && s.key) {
          const slug = statKeyFromLabel(s.label);
          const readded = arr.some(
            (o, j) =>
              j !== i &&
              o.enabled &&
              !o.key &&
              statKeyFromLabel(o.label) === slug
          );
          if (readded) return false;
        }
        return true;
      });

      const data = await api(`/api/tracker-config/${sport}`, {
        method: "PUT",
        body: {
          stats: toSave.map((s) => ({
            key: s.key,
            label: s.label.trim(),
            shortLabel: s.shortLabel.trim(),
            category: s.category,
            points: s.points,
            showInTracker: s.showInTracker,
            showInLeaderboard: s.showInTracker,
            enabled: s.enabled,
          })),
          colors,
          layout: { playerGridColumns: gridColumns },
          setRules,
        },
      });
      applyConfig(data.config as TrackerConfig);
      setNotice("Settings saved");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const savePasscode = async () => {
    setSavingPasscode(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/tracker-config/${sport}/passcode`, {
        method: "POST",
        body: {
          currentPasscode: hasPasscode ? currentPasscode : undefined,
          newPasscode,
        },
      });
      setHasPasscode(true);
      setCurrentPasscode("");
      setNewPasscode("");
      setNotice("Passcode updated");
    } catch (e: any) {
      setError(e?.message ?? "Failed to update passcode");
    } finally {
      setSavingPasscode(false);
    }
  };

  if (loading || !user) return null;

  if (!sportDef) {
    return (
      <TrackerShell>
        <main className="max-w-3xl mx-auto p-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Unknown sport</h1>
        </main>
      </TrackerShell>
    );
  }

  if (!isTracker) {
    return (
      <TrackerShell>
        <main className="max-w-3xl mx-auto p-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Access denied</h1>
        </main>
      </TrackerShell>
    );
  }

  return (
    <TrackerShell>
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {sportDef.name} tracker settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Stats, colors, layout and set rules apply to all {sportDef.name.toLowerCase()}{" "}
              tournaments.
            </p>
          </div>
          <Button onClick={() => void save()} disabled={saving || busy || !!validationError} className="font-bold">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>

        {(error || validationError) && (
          <p className="text-sm text-destructive">{error ?? validationError}</p>
        )}
        {notice && <p className="text-sm text-green-500">{notice}</p>}

        {busy ? (
          <div className="text-muted-foreground">Loading settings…</div>
        ) : (
          <>
            {/* Stats manager */}
            <Card>
              <CardHeader>
                <CardTitle>Stats</CardTitle>
                <CardDescription>
                  Each stat has a permanent <span className="font-mono text-xs">stat_key</span>{" "}
                  attached to every recorded play. Category controls button color. Value weights
                  only count toward the leaderboard total when &ldquo;Show in tracker&rdquo; is
                  on. Deleting a stat that has been tracked removes it from capture,
                  leaderboards, and all recorded history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.map((s, i) => (
                  <div
                    key={s.key ?? `new-${i}`}
                    className={cn(
                      "rounded-xl border p-3 space-y-3",
                      !s.enabled && "opacity-50"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {colors && (
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: colors[s.category] }}
                        />
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {s.key ?? "(key auto-generated on save)"}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => moveStat(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => moveStat(i, 1)} disabled={i === stats.length - 1} aria-label="Move down">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        {s.enabled ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void removeStat(i)}
                            aria-label="Delete stat"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => updateStat(i, { enabled: true })}>
                            Re-enable
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={s.label}
                          onChange={(e) => updateStat(i, { label: e.target.value })}
                          placeholder="e.g. Kill"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Button label</Label>
                        <Input
                          value={s.shortLabel}
                          onChange={(e) => updateStat(i, { shortLabel: e.target.value })}
                          placeholder="e.g. Kill"
                          maxLength={12}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={s.category}
                          onValueChange={(v) => updateStat(i, { category: v as StatCategory })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_ORDER.map((c) => (
                              <SelectItem key={c} value={c}>
                                {CATEGORY_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Value</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={Number.isFinite(s.points) ? s.points : ""}
                          onChange={(e) => updateStat(i, { points: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                      <Checkbox
                        checked={s.showInTracker}
                        onCheckedChange={(v) =>
                          updateStat(i, { showInTracker: v === true })
                        }
                      />
                      Show in tracker
                    </label>
                  </div>
                ))}

                <Button variant="outline" onClick={addStat} className="w-full">
                  <Plus className="h-4 w-4 mr-1.5" /> Add stat
                </Button>
              </CardContent>
            </Card>

            {/* Colors */}
            {colors && (
              <Card>
                <CardHeader>
                  <CardTitle>Category colors</CardTitle>
                  <CardDescription>Stat button colors on the capture page.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {CATEGORY_ORDER.map((c) => (
                    <div key={c} className="space-y-1.5">
                      <Label className="text-xs">{CATEGORY_LABELS[c]}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={colors[c]}
                          onChange={(e) => setColors({ ...colors, [c]: e.target.value })}
                          className="h-9 w-12 rounded border bg-background cursor-pointer"
                        />
                        <span className="font-mono text-xs text-muted-foreground">{colors[c]}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Layout */}
            <Card>
              <CardHeader>
                <CardTitle>Capture layout</CardTitle>
                <CardDescription>How the 6 players are arranged on the capture page.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  {([2, 3] as const).map((cols) => (
                    <button
                      key={cols}
                      onClick={() => setGridColumns(cols)}
                      className={cn(
                        "rounded-xl border px-5 py-3 text-sm font-semibold transition-colors",
                        gridColumns === cols
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-muted/60"
                      )}
                    >
                      {cols} × {Math.ceil(6 / cols)} grid
                      <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                        {cols} columns
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Set rules */}
            {setRules && (
              <Card>
                <CardHeader>
                  <CardTitle>Set rules</CardTitle>
                  <CardDescription>
                    Drives the set flow (best of {setRules.totalSets}) and the automatic
                    &ldquo;End set?&rdquo; prompt.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <RuleInput label="Total sets" value={setRules.totalSets} onChange={(v) => setSetRules({ ...setRules, totalSets: v })} />
                  <RuleInput label="Sets to win" value={setRules.setsToWin} onChange={(v) => setSetRules({ ...setRules, setsToWin: v })} />
                  <RuleInput label="Points per set" value={setRules.pointsToWinSet} onChange={(v) => setSetRules({ ...setRules, pointsToWinSet: v })} />
                  <RuleInput label="Deciding set points" value={setRules.pointsToWinDecidingSet} onChange={(v) => setSetRules({ ...setRules, pointsToWinDecidingSet: v })} />
                  <RuleInput label="Win by" value={setRules.winBy} onChange={(v) => setSetRules({ ...setRules, winBy: v })} />
                </CardContent>
              </Card>
            )}

            {/* Passcode */}
            <Card>
              <CardHeader>
                <CardTitle>Unlock passcode</CardTitle>
                <CardDescription>
                  4-digit passcode required to edit a completed set or a completed match.
                  {hasPasscode ? " A passcode is currently set." : " No passcode set yet."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-w-sm">
                {hasPasscode && (
                  <div className="space-y-1">
                    <Label className="text-xs">Current passcode</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={currentPasscode}
                      onChange={(e) => setCurrentPasscode(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">New passcode (4 digits)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                  />
                </div>
                <Button
                  onClick={() => void savePasscode()}
                  disabled={
                    savingPasscode ||
                    newPasscode.length !== 4 ||
                    (hasPasscode && currentPasscode.length !== 4)
                  }
                >
                  {savingPasscode ? "Saving…" : hasPasscode ? "Change passcode" : "Set passcode"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (!open && !purging) {
              setDeleteDialogOpen(false);
              setDeleteTargetIndex(null);
              setDeleteImpact(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Delete &ldquo;{deleteImpact?.label ?? stats[deleteTargetIndex ?? 0]?.label}&rdquo;?
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  {deleteImpactLoading ? (
                    <p>Checking how much data has been recorded for this stat…</p>
                  ) : deleteImpact ? (
                    <>
                      <p>
                        This stat has been recorded{" "}
                        <strong className="text-foreground">{deleteImpact.playCount}</strong>{" "}
                        {deleteImpact.playCount === 1 ? "time" : "times"} across{" "}
                        <strong className="text-foreground">{deleteImpact.tournamentCount}</strong>{" "}
                        {deleteImpact.tournamentCount === 1 ? "tournament" : "tournaments"} (
                        {deleteImpact.matchCount}{" "}
                        {deleteImpact.matchCount === 1 ? "match" : "matches"},{" "}
                        {deleteImpact.playerCount}{" "}
                        {deleteImpact.playerCount === 1 ? "player" : "players"}).
                      </p>
                      <p>
                        Deleting will remove all of those entries from match history, player stats,
                        and leaderboards. This cannot be undone.
                      </p>
                    </>
                  ) : null}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={purging}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmPurgeStat()}
                disabled={deleteImpactLoading || purging || !deleteImpact}
              >
                {purging ? "Deleting…" : "Delete stat and all tracked data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TrackerShell>
  );
}

function RuleInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
      />
    </div>
  );
}
