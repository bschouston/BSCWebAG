"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLAYOFF_CONFIG,
  MIN_PLAYOFF_TEAMS,
  applyReseedIntentToStructure,
  buildPlayoffResultsMap,
  buildPlayoffStructureWithReseed,
  buildPlayoffTeamMetaFromSeeds,
  generateDoubleEliminationBracket,
  getMatchDeleteBlockers,
  hasUnpublishedReadySlots,
  isPlayoffBracketComplete,
  materializePlayoffStructure,
  rankStandings,
  resolvePlayoffChampion,
  resolvePlayoffConfig,
  resolveStandingsConfig,
  type PlayoffBracketDoc,
  type PlayoffBracketStructure,
  type PlayoffConfig,
  type PlayoffTeamInput,
} from "@bsc/shared";
import { ArrowDown, ArrowUp, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PlayoffBracketPreview } from "@/components/admin/playoff-bracket-previews";
import type { PublishedPlayoffMatchInfo } from "@/components/tournament/playoff-bracket-view";
import {
  ConfirmTypeDeleteDialog,
  matchDeleteConsequences,
  playoffsClearConsequences,
} from "@/components/tournament/confirm-type-delete-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type TeamRow = { id: string; name: string; color?: string | null };
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
  playSeq?: number;
  startedAt?: unknown;
  completedAt?: unknown;
  lastPlayAt?: unknown;
  setScores?: { a: number; b: number }[];
  trackingTeamId?: string | null;
};

type ActiveLock = {
  matchId: string;
  teamKey: "A" | "B";
  ownerName: string;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

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
  const [championTeamId, setChampionTeamId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishedPlayoffs, setPublishedPlayoffs] = useState<PublishedPlayoffMatchInfo[]>([]);
  const [busyFirestoreId, setBusyFirestoreId] = useState<string | null>(null);
  const [pendingDeletePublished, setPendingDeletePublished] =
    useState<PublishedPlayoffMatchInfo | null>(null);
  const [pendingClearPlayoffs, setPendingClearPlayoffs] = useState(false);
  const [editingPublished, setEditingPublished] = useState<PublishedPlayoffMatchInfo | null>(
    null
  );
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editCourtNumber, setEditCourtNumber] = useState("");
  const [editTeamAId, setEditTeamAId] = useState("");
  const [editTeamBId, setEditTeamBId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [enableStatTrackingTeams, setEnableStatTrackingTeams] = useState(false);
  const [savingTrackingMatchId, setSavingTrackingMatchId] = useState<string | null>(
    null
  );

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
      const [tRes, statsRes, locksRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`, { headers }),
        fetch(`/api/tournaments/${tournamentId}/stats`, { headers }),
        fetch(`/api/tournaments/${tournamentId}/locks`, { headers }),
      ]);
      const tData = await tRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));
      const locksData = await locksRes.json().catch(() => ({}));
      if (!tRes.ok) throw new Error(tData?.error ?? "Failed to load tournament");
      if (!statsRes.ok) throw new Error(statsData?.error ?? "Failed to load stats");

      const cfg = resolvePlayoffConfig(tData?.tournament?.playoffConfig);
      setConfig(cfg);
      setStandingsConfigRaw(tData?.tournament?.standingsConfig);
      setEnableStatTrackingTeams(tData?.tournament?.enableStatTrackingTeams === true);

      const loadedTeams = (statsData.teams ?? []).map(
        (t: { id: string; name?: string; color?: string | null }) => ({
          id: t.id,
          name: t.name ?? t.id,
          color: t.color ?? null,
        })
      );
      setTeams(loadedTeams);
      setTeamStats(
        (statsData.teamStats ?? []).map((s: TeamStatsRow & { id: string }) => ({
          ...s,
          id: s.id,
        }))
      );
      const loadedMatches = (statsData.matches ?? []) as MatchRow[];
      setMatches(loadedMatches);

      const locksByMatch = new Map<string, ActiveLock[]>();
      for (const lock of (locksData.locks ?? []) as ActiveLock[]) {
        if (!lock.matchId || (lock.teamKey !== "A" && lock.teamKey !== "B")) continue;
        const list = locksByMatch.get(lock.matchId) ?? [];
        list.push(lock);
        locksByMatch.set(lock.matchId, list);
      }

      const nameByIdForPublished = new Map<string, string>(
        loadedTeams.map((t: TeamRow) => [t.id, t.name])
      );
      const published: PublishedPlayoffMatchInfo[] = loadedMatches
        .filter((m) => m.phase === "PLAYOFF" && m.bracketMatchId)
        .map((m) => {
          const matchLocks = locksByMatch.get(m.id) ?? [];
          return {
            bracketMatchId: String(m.bracketMatchId),
            firestoreId: m.id,
            courtNumber: m.courtNumber ?? null,
            scheduledAt: m.scheduledAt ?? null,
            status: m.status,
            playSeq: m.playSeq,
            startedAt: m.startedAt,
            completedAt: m.completedAt,
            lastPlayAt: m.lastPlayAt,
            winnerTeamId: m.winnerTeamId ?? null,
            teamAId: m.teamAId ?? null,
            teamBId: m.teamBId ?? null,
            teamAName: m.teamAId ? nameByIdForPublished.get(m.teamAId) ?? null : null,
            teamBName: m.teamBId ? nameByIdForPublished.get(m.teamBId) ?? null : null,
            trackingTeamId: m.trackingTeamId ?? null,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            setScores: m.setScores,
            activeLockCount: matchLocks.length,
            activeLocks: matchLocks.map((l) => ({
              teamKey: l.teamKey,
              ownerName: l.ownerName || "Unknown",
            })),
          };
        });
      setPublishedPlayoffs(published);

      setChampionTeamId(
        typeof tData?.tournament?.championTeamId === "string"
          ? tData.tournament.championTeamId
          : null
      );

      const saved: PlayoffBracketDoc | null = tData?.tournament?.playoffBracket ?? null;
      if (saved?.seeds?.length && saved.structure) {
        setHasSavedBracket(true);
        const nameById = new Map(loadedTeams.map((t: TeamRow) => [t.id, t.name]));
        const seeds: PlayoffTeamInput[] = [...saved.seeds]
          .sort((a, b) => a.seed - b.seed)
          .map((s) => ({
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
        setChampionTeamId(null);
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

  /** Feeder template + completed results, then deferred reseed reshuffle for concrete rounds. */
  const displayStructure = useMemo(() => {
    if (!structure) return null;
    const results = buildPlayoffResultsMap(
      publishedPlayoffs.map((p) => ({
        bracketMatchId: p.bracketMatchId,
        status: p.status,
        winnerTeamId: p.winnerTeamId,
        teamAId: p.teamAId,
        teamBId: p.teamBId,
      }))
    );
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    const seeds = seedTeams.map((t, i) => ({
      teamId: t.teamId,
      seed: i + 1,
      name: t.name,
    }));
    const teamMeta = buildPlayoffTeamMetaFromSeeds(seeds, nameById);
    for (const t of teams) {
      if (!teamMeta.has(t.id)) {
        teamMeta.set(t.id, { teamId: t.id, name: t.name, seed: 9999 });
      }
    }
    const materialized = materializePlayoffStructure(structure, results, teamMeta);
    return applyReseedIntentToStructure(
      materialized,
      config.reseedEnabled ? config.reseedRoundKeys : []
    );
  }, [structure, publishedPlayoffs, seedTeams, teams, config.reseedEnabled, config.reseedRoundKeys]);

  const teamColors = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const t of teams) map[t.id] = t.color;
    return map;
  }, [teams]);

  const canCrownChampion = useMemo(() => {
    if (!structure || championTeamId) return false;
    if (!isPlayoffBracketComplete(structure, publishedPlayoffs)) return false;
    if (!displayStructure) return false;
    const publishedIds = new Set(publishedPlayoffs.map((p) => p.bracketMatchId));
    if (hasUnpublishedReadySlots(displayStructure, publishedIds)) return false;
    const results = buildPlayoffResultsMap(
      publishedPlayoffs.map((p) => ({
        bracketMatchId: p.bracketMatchId,
        status: p.status,
        winnerTeamId: p.winnerTeamId,
        teamAId: p.teamAId,
        teamBId: p.teamBId,
      }))
    );
    return resolvePlayoffChampion(structure, results) != null;
  }, [structure, displayStructure, publishedPlayoffs, championTeamId]);

  const championName = useMemo(() => {
    if (!championTeamId) return null;
    return teams.find((t) => t.id === championTeamId)?.name ?? championTeamId;
  }, [championTeamId, teams]);

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

  const toggleReseedRound = (key: string, checked: boolean) => {
    const keys = new Set(config.reseedRoundKeys);
    if (checked) keys.add(key);
    else keys.delete(key);
    const nextKeys = [...keys];
    setConfig((prev) => ({
      ...prev,
      reseedEnabled: nextKeys.length > 0,
      reseedRoundKeys: nextKeys,
    }));
    setReseedDirty(true);
  };

  const persistBracket = async (): Promise<boolean> => {
    const toSave = baseStructure ?? structure;
    if (!toSave || seedTeams.length < MIN_PLAYOFF_TEAMS) {
      setError("Generate a bracket before saving.");
      return false;
    }
    const playoffConfigPayload = {
      ...config,
      reseedEnabled: config.reseedRoundKeys.length > 0,
      reseedRoundKeys: config.reseedRoundKeys,
    };
    const headers = await authHeaders();
    // After matches exist, only persist reseed intent — bracket template is frozen.
    const body: Record<string, unknown> = { playoffConfig: playoffConfigPayload };
    if (publishedPlayoffs.length === 0) {
      body.playoffBracket = {
        generatedAt: new Date().toISOString(),
        seeds: seedTeams.map((t, i) => ({
          teamId: t.teamId,
          seed: i + 1,
          name: t.name,
        })),
        structure: toSave,
      } satisfies PlayoffBracketDoc;
    }
    const res = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
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
    setPendingClearPlayoffs(true);
  };

  const confirmClearBracket = async () => {
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
      setSelectedMatchIds([]);
      setPendingClearPlayoffs(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  const generateNext = async (opts?: { crown?: boolean }) => {
    const matchIds = [...selectedMatchIds];
    const crowning = !!opts?.crown || matchIds.length === 0;
    if (!crowning && matchIds.length === 0) {
      setError("Select at least one match with both teams known.");
      return;
    }
    if (crowning && matchIds.length > 0) {
      // Prefer publishing selection when matches are checked.
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
        body: JSON.stringify(crowning && matchIds.length === 0 ? {} : { matchIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate matches");
      setSelectedMatchIds([]);
      if (data?.crowned) {
        window.alert(
          data.alreadyCrowned
            ? `Champion already crowned: ${data.championName ?? data.championTeamId}`
            : `Champion crowned: ${data.championName ?? data.championTeamId}`
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate matches");
    } finally {
      setGenerating(false);
    }
  };

  const deletePlayoffsBlockers = useMemo(() => {
    const blockers: string[] = [];
    for (const p of publishedPlayoffs) {
      const matchBlockers = getMatchDeleteBlockers(
        {
          status: p.status,
          phase: "PLAYOFF",
          playSeq: p.playSeq,
          startedAt: p.startedAt,
          completedAt: p.completedAt,
          lastPlayAt: p.lastPlayAt,
          winnerTeamId: p.winnerTeamId,
        },
        { activeLockCount: p.activeLockCount ?? 0 },
        { allowCompletedPlayoff: true }
      );
      for (const b of matchBlockers) {
        blockers.push(`${p.bracketMatchId}: ${b}`);
      }
    }
    return blockers;
  }, [publishedPlayoffs]);

  const openEditPublished = (info: PublishedPlayoffMatchInfo) => {
    setEditingPublished(info);
    setEditScheduledAt(toDatetimeLocalValue(info.scheduledAt));
    setEditCourtNumber(info.courtNumber != null ? String(info.courtNumber) : "");
    setEditTeamAId(info.teamAId ?? "");
    setEditTeamBId(info.teamBId ?? "");
    setEditError(null);
  };

  const saveEditPublished = async () => {
    if (!editingPublished?.firestoreId) return;
    setEditSaving(true);
    setEditError(null);
    try {
      if (!editTeamAId || !editTeamBId) {
        throw new Error("Select both teams");
      }
      if (editTeamAId === editTeamBId) {
        throw new Error("Teams must be different");
      }
      const headers = await authHeaders();
      const courtRaw = editCourtNumber.trim();
      let courtNumber: number | null = null;
      if (courtRaw) {
        const n = Number(courtRaw);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error("Court must be a positive number");
        }
        courtNumber = Math.floor(n);
      }
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${editingPublished.firestoreId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            teamAId: editTeamAId,
            teamBId: editTeamBId,
            scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
            courtNumber,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? data?.blockers?.[0] ?? "Failed to update match");
      setEditingPublished(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update match");
    } finally {
      setEditSaving(false);
    }
  };

  const deletePublishedMatch = async (info: PublishedPlayoffMatchInfo) => {
    if (!info.firestoreId) return;
    const blockers = getMatchDeleteBlockers(
      {
        status: info.status,
        phase: "PLAYOFF",
        playSeq: info.playSeq,
        startedAt: info.startedAt,
        completedAt: info.completedAt,
        lastPlayAt: info.lastPlayAt,
        winnerTeamId: info.winnerTeamId,
      },
      { activeLockCount: info.activeLockCount ?? 0 }
    );
    if (blockers.length) return;
    setPendingDeletePublished(info);
  };

  const forceReleaseLocks = async (info: PublishedPlayoffMatchInfo) => {
    if (!info.firestoreId) return;
    if (!window.confirm("Force release tracker locks for this match?")) return;
    setBusyFirestoreId(info.firestoreId);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${info.firestoreId}/release-locks`,
        { method: "POST", headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to release locks");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release locks");
    } finally {
      setBusyFirestoreId(null);
    }
  };

  const saveTrackingTeam = async (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => {
    if (!info.firestoreId) return;
    setSavingTrackingMatchId(info.firestoreId);
    setError(null);
    const prev = info.trackingTeamId ?? null;
    setPublishedPlayoffs((current) =>
      current.map((p) =>
        p.firestoreId === info.firestoreId ? { ...p, trackingTeamId } : p
      )
    );
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${info.firestoreId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ trackingTeamId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to update stat tracking team");
    } catch (err) {
      setPublishedPlayoffs((current) =>
        current.map((p) =>
          p.firestoreId === info.firestoreId ? { ...p, trackingTeamId: prev } : p
        )
      );
      setError(err instanceof Error ? err.message : "Failed to update stat tracking team");
    } finally {
      setSavingTrackingMatchId(null);
    }
  };

  const confirmDeletePublishedMatch = async () => {
    const info = pendingDeletePublished;
    if (!info?.firestoreId) return;
    setBusyFirestoreId(info.firestoreId);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${info.firestoreId}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          Array.isArray(data?.blockers) && data.blockers.length
            ? `${data.error ?? "Cannot delete match"}: ${data.blockers.join("; ")}`
            : (data?.error ?? "Failed to delete match");
        throw new Error(detail);
      }
      setPendingDeletePublished(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
    } finally {
      setBusyFirestoreId(null);
    }
  };

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
                    loading || saving || !structure || (hasSavedBracket && !reseedDirty)
                  }
                  onClick={() => void save()}
                >
                  {saving ? "Saving…" : "Save Playoffs"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    loading ||
                    saving ||
                    !hasSavedBracket ||
                    deletePlayoffsBlockers.length > 0
                  }
                  title={
                    deletePlayoffsBlockers.length
                      ? deletePlayoffsBlockers.join("; ")
                      : undefined
                  }
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
              {reseedDirty ? (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  Unsaved reseed changes — Save Playoffs or Generate Next to persist.
                </p>
              ) : null}

              <div className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Publish matches</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When a round has both teams known, optionally check Reseed on that round to
                      pair best vs worst seed. Then check matches and Generate Next to schedule
                      them. Unsaved reseed settings are saved when you generate. Reseed locks for a
                      round after its matches are published.
                      {canCrownChampion
                        ? " After the final is complete, use Crown champion to persist the winner."
                        : null}
                    </p>
                    {championName ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                        <Crown className="size-4" aria-hidden />
                        Champion: {championName}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      generating ||
                      saving ||
                      (selectedMatchIds.length === 0 && !canCrownChampion)
                    }
                    onClick={() =>
                      void generateNext({
                        crown: selectedMatchIds.length === 0 && canCrownChampion,
                      })
                    }
                  >
                    {generating
                      ? "Working…"
                      : selectedMatchIds.length === 0 && canCrownChampion
                        ? "Crown champion"
                        : "Generate Next"}
                  </Button>
                </div>
              </div>

              <PlayoffBracketPreview
                structure={displayStructure ?? structure}
                feederStructure={structure}
                publishedMatches={publishedPlayoffs}
                selectionEnabled={!!structure}
                selectedMatchIds={selectedMatchIds}
                onSelectedMatchIdsChange={setSelectedMatchIds}
                onEditPublished={openEditPublished}
                onDeletePublished={(info) => void deletePublishedMatch(info)}
                onReleaseLocks={(info) => void forceReleaseLocks(info)}
                busyFirestoreId={busyFirestoreId}
                teamColors={teamColors}
                championTeamId={championTeamId}
                reseedRoundKeys={config.reseedRoundKeys}
                onToggleReseedRound={toggleReseedRound}
                enableStatTrackingTeams={enableStatTrackingTeams}
                trackingTeams={teams.map((t) => ({ id: t.id, name: t.name }))}
                onTrackingTeamChange={(info, trackingTeamId) =>
                  void saveTrackingTeam(info, trackingTeamId)
                }
                savingTrackingMatchId={savingTrackingMatchId}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editingPublished != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingPublished(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit playoff match</DialogTitle>
            <DialogDescription>
              {editingPublished ? (
                <>
                  {editingPublished.bracketMatchId}
                  {editingPublished.firestoreId ? (
                    <>
                      {" · "}
                      MatchID:{" "}
                      <span className="font-mono">{editingPublished.firestoreId}</span>
                    </>
                  ) : null}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Team A</Label>
              <Select value={editTeamAId || undefined} onValueChange={setEditTeamAId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team A" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Team B</Label>
              <Select value={editTeamBId || undefined} onValueChange={setEditTeamBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team B" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="playoff-edit-time">Scheduled time</Label>
              <Input
                id="playoff-edit-time"
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="playoff-edit-court">Court</Label>
              <Input
                id="playoff-edit-court"
                type="number"
                min={1}
                value={editCourtNumber}
                onChange={(e) => setEditCourtNumber(e.target.value)}
                placeholder="Court number"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Changing teams does not validate bracket feeders — you are responsible for
              consistency.
            </p>
            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPublished(null)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button type="button" disabled={editSaving} onClick={() => void saveEditPublished()}>
                {editSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmTypeDeleteDialog
        open={pendingDeletePublished != null}
        onOpenChange={(open) => {
          if (!open && busyFirestoreId == null) setPendingDeletePublished(null);
        }}
        title={`Delete playoff match ${pendingDeletePublished?.bracketMatchId ?? ""}?`}
        description={
          pendingDeletePublished
            ? `Status: ${pendingDeletePublished.status ?? "UPCOMING"}. Removes this published match from the schedule and unpublishes its bracket slot. This cannot be undone.`
            : "This cannot be undone."
        }
        consequences={matchDeleteConsequences()}
        destructiveHint={
          pendingDeletePublished &&
          (pendingDeletePublished.status === "COMPLETED" ||
            (pendingDeletePublished.playSeq ?? 0) > 0)
            ? "This match has recorded results or plays. Deleting it permanently removes those results and recalculates standings and player/team stats without this match."
            : null
        }
        confirming={busyFirestoreId != null}
        onConfirm={confirmDeletePublishedMatch}
      />

      <ConfirmTypeDeleteDialog
        open={pendingClearPlayoffs}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingClearPlayoffs(false);
        }}
        title="Delete playoffs?"
        description="All-or-nothing wipe of the saved bracket and every published playoff match (including completed). Blocked only if any playoff match is in progress or has an active tracker lock."
        consequences={playoffsClearConsequences()}
        destructiveHint={
          publishedPlayoffs.some(
            (p) => p.status === "COMPLETED" || (p.playSeq ?? 0) > 0
          )
            ? "One or more published playoff matches have recorded results. Deleting playoffs permanently removes those results and recalculates standings and stats."
            : null
        }
        confirmLabel="Delete playoffs"
        confirming={saving}
        onConfirm={confirmClearBracket}
      />
    </div>
  );
}
