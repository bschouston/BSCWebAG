"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Check, Lock, LockOpen, Minus, Plus, Trash2, WifiOff } from "lucide-react";
import {
  DEFAULT_SET_RULES,
  DEFAULT_TRACKER_COLORS,
  DEFAULT_TRACKER_LAYOUT,
  isSetComplete,
  isTrackerStatVisible,
  normalizeTrackerConfig,
  type PlayerLayout,
  type SetRules,
  type StatCategory,
  type TrackerColors,
  type TrackerStat,
} from "@bsc/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@bsc/ui";
import { db } from "@/lib/firebase/client";
import { profileCanManageTrackerSports, useAuth } from "@/lib/auth-context";
import {
  getActiveUnlock,
  sportFromStatTrackerId,
  unlockCoversSet,
  type EditUnlock,
} from "@/lib/match-edit";

type TeamKey = "A" | "B";

type MatchDoc = {
  teamAId: string;
  teamBId: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  winnerTeamId?: string | null;
  editUnlock?: EditUnlock | null;
};

type PlayerRow = { id: string; displayName: string; number?: number | null };

type PlayRow = {
  id: string;
  seq: number;
  setNumber: number;
  entries: { playerId: string | null; statKey: string }[];
  pointTo: TeamKey | null;
  kind?: "score_adjust" | "stat";
  delta?: number;
};

const HEARTBEAT_MS = 60 * 1000;

const BTN = {
  compact: "h-9 min-h-9 min-w-0 px-1 text-[10px] rounded-lg",
  normal: "h-11 min-h-11 min-w-0 px-1.5 text-xs sm:text-sm rounded-lg",
} as const;

const LIFECYCLE_BTN = {
  compact: "h-9 w-full font-bold",
  normal: "h-11 w-full font-bold",
} as const;

/** Display order for stat category rows (each color gets its own row). */
const STAT_CATEGORY_ORDER: StatCategory[] = ["positive", "positive_points", "negative"];

function statsGroupedByCategory(stats: TrackerStat[]) {
  const grouped = new Map<StatCategory, TrackerStat[]>(
    STAT_CATEGORY_ORDER.map((cat) => [cat, []])
  );
  for (const stat of stats) {
    const cat =
      stat.category === "positive_scoring"
        ? "positive_points"
        : stat.category === "negative_scoring"
          ? "negative"
          : stat.category;
    grouped.get(cat)?.push(stat);
  }
  return STAT_CATEGORY_ORDER.map((category) => ({
    category,
    stats: grouped.get(category) ?? [],
  })).filter((row) => row.stats.length > 0);
}

function colorForCategory(colors: TrackerColors, category: StatCategory): string {
  if (category === "positive_points" || category === "positive_scoring") {
    return colors.positive_points || colors.positive_scoring || "#22c55e";
  }
  if (category === "negative_scoring") return colors.negative_scoring || colors.negative;
  return colors[category] || "#888888";
}

/** Readable text color for a hex background. */
function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
}

export default function TrackPage({
  params,
}: {
  params: Promise<{ tournamentId: string; matchId: string }>;
}) {
  const { tournamentId, matchId } = use(params);
  const { user, profile, loading, signOut } = useAuth();
  const search = useSearchParams();
  const teamKey = (search.get("team") ?? "A") as TeamKey;
  const viewOnly = search.get("view") === "1";
  const editMode = search.get("edit") === "1" && !viewOnly;
  const isPlatformAdmin =
    profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
  const canAdminBypassEdit =
    isPlatformAdmin || profileCanManageTrackerSports(profile);
  /** Completed-match edit skips team session locks (same as view-only). */
  const skipTeamLock = viewOnly || editMode;

  const [lockState, setLockState] = useState<"acquiring" | "held" | "lost">(
    skipTeamLock ? "held" : "acquiring"
  );
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<PlayerRow[]>([]);
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [sport, setSport] = useState<string | null>(null);

  const [stats, setStats] = useState<TrackerStat[]>([]);
  const [colors, setColors] = useState<TrackerColors>(DEFAULT_TRACKER_COLORS);
  const [gridColumns, setGridColumns] = useState<2 | 3>(DEFAULT_TRACKER_LAYOUT.playerGridColumns);
  const [playerLayout, setPlayerLayout] = useState<PlayerLayout>(
    DEFAULT_TRACKER_LAYOUT.playerLayout
  );
  const [setRules, setSetRules] = useState<SetRules>(DEFAULT_SET_RULES);

  const [viewedSet, setViewedSet] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingTaps, setPendingTaps] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapChainRef = useRef<Promise<void>>(Promise.resolve());
  const adminAutoUnlockDoneRef = useRef(false);
  const releaseLockRef = useRef<(() => Promise<void>) | null>(null);

  const api = useCallback(
    async (path: string, body?: unknown) => {
      const token = await user?.getIdToken();
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [user]
  );

  const releaseTeamLock = useCallback(async () => {
    if (skipTeamLock) return;
    try {
      await api("/api/locks/release", { tournamentId, matchId, teamKey });
    } catch {
      // lock may already be gone
    }
  }, [api, skipTeamLock, tournamentId, matchId, teamKey]);

  releaseLockRef.current = () => releaseTeamLock();

  // Online/offline indicator.
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Tick for the unlock countdown.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Acquire (or resume) the session lock, then keep it alive with heartbeats.
  // View-only and admin edit of completed matches skip team locks entirely.
  // Cleanup releases the lock so backing out / leaving the page frees it.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    if (skipTeamLock) {
      setLockState("held");
      return;
    }
    let cancelled = false;

    const acquire = async () => {
      try {
        await api("/api/locks/acquire", { tournamentId, matchId, teamKey });
        if (!cancelled) setLockState("held");
      } catch (e: any) {
        if (!cancelled) {
          setLockState("lost");
          setError(e?.message ?? "Unable to acquire lock");
        }
      }
    };
    void acquire();

    heartbeatRef.current = setInterval(() => {
      api("/api/locks/heartbeat", { tournamentId, matchId, teamKey }).catch(() => {
        setLockState("lost");
      });
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      void releaseLockRef.current?.();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("pagehide", onPageHide);
      void releaseLockRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, tournamentId, matchId, teamKey, skipTeamLock]);

  // Tournament doc -> sport (for the tracker config subscription).
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "tournaments", tournamentId), (snap) => {
      const id = (snap.data() as any)?.statTrackerId;
      if (id) setSport(sportFromStatTrackerId(String(id)));
    });
  }, [user, tournamentId]);

  // Global tracker config: stats, colors, layout, set rules stream live.
  useEffect(() => {
    if (!user || !sport) return;
    return onSnapshot(doc(db, "trackerConfigs", sport), (snap) => {
      const data = snap.data() as any;
      if (!data) return;
      const raw = {
        sport,
        stats: Array.isArray(data.stats) ? data.stats : [],
        colors: data.colors ?? DEFAULT_TRACKER_COLORS,
        layout: data.layout ?? DEFAULT_TRACKER_LAYOUT,
        setRules: data.setRules ?? DEFAULT_SET_RULES,
      };
      const { config } = normalizeTrackerConfig(raw as any);
      setStats([...config.stats].sort((a, b) => a.order - b.order));
      setColors({
        ...DEFAULT_TRACKER_COLORS,
        ...config.colors,
        positive_points:
          config.colors.positive_points ||
          config.colors.positive_scoring ||
          DEFAULT_TRACKER_COLORS.positive_points,
      });
      if (config.layout?.playerGridColumns) setGridColumns(config.layout.playerGridColumns);
      setPlayerLayout(config.layout?.playerLayout === "rows" ? "rows" : "grid");
      if (config.setRules) setSetRules(config.setRules);
    });
  }, [user, sport]);

  // Realtime match doc — this is what syncs the opponent tablet's points here.
  useEffect(() => {
    if (!user) return;
    const matchRef = doc(db, "tournaments", tournamentId, "matches", matchId);
    return onSnapshot(matchRef, (snap) => {
      setMatch(snap.exists() ? (snap.data() as MatchDoc) : null);
    });
  }, [user, tournamentId, matchId]);

  // Team names.
  useEffect(() => {
    if (!user || !match?.teamAId || !match?.teamBId) return;
    const unsubs = [match.teamAId, match.teamBId].map((teamId) =>
      onSnapshot(doc(db, "tournaments", tournamentId, "teams", teamId), (snap) => {
        const name = (snap.data() as any)?.name;
        if (name) setTeamNames((prev) => ({ ...prev, [teamId]: name }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user, tournamentId, match?.teamAId, match?.teamBId]);

  // Roster of the tracked team.
  const trackedTeamId = teamKey === "A" ? match?.teamAId : match?.teamBId;
  useEffect(() => {
    if (!user || !trackedTeamId) return;
    const q = query(
      collection(db, "tournaments", tournamentId, "players"),
      where("teamId", "==", trackedTeamId)
    );
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlayerRow[];
      rows.sort(
        (a, b) =>
          (a.number ?? 999) - (b.number ?? 999) || a.displayName.localeCompare(b.displayName)
      );
      setRoster(rows);
    });
  }, [user, tournamentId, trackedTeamId]);

  const playerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roster) map[p.id] = p.displayName;
    return map;
  }, [roster]);

  const playerNumbers = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of roster) {
      if (p.number != null) map[p.id] = p.number;
    }
    return map;
  }, [roster]);

  const statByKey = useMemo(() => new Map(stats.map((s) => [s.key, s])), [stats]);
  const enabledStats = useMemo(
    () => stats.filter((s) => isTrackerStatVisible(s)),
    [stats]
  );
  const playerStats = useMemo(
    () => enabledStats.filter((s) => s.requiresPlayer),
    [enabledStats]
  );
  const teamLevelStats = useMemo(
    () => enabledStats.filter((s) => !s.requiresPlayer),
    [enabledStats]
  );
  const playerStatsByCategory = useMemo(
    () => statsGroupedByCategory(playerStats),
    [playerStats]
  );
  const teamStatsByCategory = useMemo(
    () => statsGroupedByCategory(teamLevelStats),
    [teamLevelStats]
  );

  const status = match?.status ?? "UPCOMING";
  const currentSet = match?.currentSet ?? 1;
  const setScores = match?.setScores ?? [];
  const activeSet = viewedSet ?? currentSet;
  const viewedScore = setScores[activeSet - 1] ?? { a: 0, b: 0 };
  const teamAName = teamNames[match?.teamAId ?? ""] ?? "Team A";
  const teamBName = teamNames[match?.teamBId ?? ""] ?? "Team B";
  const trackedTeamName = teamKey === "A" ? teamAName : teamBName;
  const trackedSetPoints = teamKey === "A" ? viewedScore.a : viewedScore.b;
  const trackedSetsWon = teamKey === "A" ? (match?.scoreA ?? 0) : (match?.scoreB ?? 0);

  // Locking state for the viewed set.
  const activeUnlock = match ? getActiveUnlock({ editUnlock: match.editUnlock }) : null;
  // nowTick keeps this re-evaluating as expiry approaches.
  const unlockValid = !!activeUnlock && activeUnlock.expiresAt > nowTick;
  const setIsLocked = (setNo: number) =>
    status === "COMPLETED" || (status === "IN_PROGRESS" && setNo < currentSet);
  const viewedSetLocked = setIsLocked(activeSet);
  const viewedSetUnlocked =
    viewedSetLocked && unlockValid && unlockCoversSet(activeUnlock, activeSet);

  // Admins / tablet tracker admins entering Edit on a completed match get an automatic match unlock (once).
  useEffect(() => {
    if (!editMode || !user || !match || status !== "COMPLETED" || !canAdminBypassEdit) return;
    if (unlockValid && activeUnlock?.scope === "match") {
      adminAutoUnlockDoneRef.current = true;
      return;
    }
    if (adminAutoUnlockDoneRef.current) return;
    adminAutoUnlockDoneRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
          adminBypass: true,
          scope: "match",
        });
      } catch (e: unknown) {
        if (!cancelled) {
          adminAutoUnlockDoneRef.current = false;
          setError(e instanceof Error ? e.message : "Failed to unlock match for editing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, user, matchId, status, canAdminBypassEdit, unlockValid, activeUnlock?.scope]);

  const canRecord =
    !viewOnly &&
    ((!viewedSetLocked && status === "IN_PROGRESS" && lockState === "held" && activeSet === currentSet) ||
      viewedSetUnlocked);

  const canAdjustScore =
    !viewOnly &&
    status !== "UPCOMING" &&
    lockState === "held" &&
    ((!viewedSetLocked && status === "IN_PROGRESS" && activeSet === currentSet) || viewedSetUnlocked);

  // This team's play history (latest first). Filtered to the active set in viewedPlays.
  // Higher limit so completed / multi-set matches still include earlier set point logs.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tournaments", tournamentId, "matches", matchId, "plays"),
      where("teamKey", "==", teamKey),
      where("deleted", "==", false),
      orderBy("seq", "desc"),
      limit(viewOnly || status === "COMPLETED" ? 1000 : 120)
    );
    return onSnapshot(
      q,
      (snap) => {
        setPlays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlayRow[]);
      },
      (err) => {
        console.error("Plays query failed", err);
        setPlays([]);
      }
    );
  }, [user, tournamentId, matchId, teamKey, viewOnly, status]);

  // Set-point prompt on the live set. If awarding this set gives a team
  // enough sets to win, the match is decided and we prompt End match instead.
  const liveScore = setScores[currentSet - 1] ?? { a: 0, b: 0 };
  const setPointReached =
    status === "IN_PROGRESS" && isSetComplete(liveScore.a, liveScore.b, currentSet, setRules);
  const liveLeader = liveScore.a > liveScore.b ? "A" : liveScore.b > liveScore.a ? "B" : null;
  const prospectiveSetsA = (match?.scoreA ?? 0) + (liveLeader === "A" ? 1 : 0);
  const prospectiveSetsB = (match?.scoreB ?? 0) + (liveLeader === "B" ? 1 : 0);
  const matchDecided =
    setPointReached && Math.max(prospectiveSetsA, prospectiveSetsB) >= setRules.setsToWin;

  /** Tap-to-record: queue serializes rapid taps so none are dropped. */
  const recordTap = (playerId: string | null, statKey: string) => {
    if (!canRecord) return;
    const flashId = `${playerId ?? "team"}:${statKey}`;
    setFlash(flashId);
    setTimeout(() => setFlash((f) => (f === flashId ? null : f)), 500);
    setError(null);
    setPendingTaps((n) => n + 1);

    const body: Record<string, unknown> = {
      teamKey,
      entries: [{ playerId, statKey }],
    };
    if (viewedSetLocked) body.setNumber = activeSet;

    tapChainRef.current = tapChainRef.current
      .then(() => api(`/api/tournaments/${tournamentId}/matches/${matchId}/plays`, body))
      .catch((e: any) => {
        setError(e?.message ?? "Failed to record stat");
      })
      .finally(() => setPendingTaps((n) => Math.max(0, n - 1)));
  };

  const adjustScore = async (delta: 1 | -1) => {
    if (!canAdjustScore) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { teamKey, delta };
      if (viewedSetLocked) body.setNumber = activeSet;
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/score`, body);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update score");
    } finally {
      setBusy(false);
    }
  };

  const deletePlay = async (playId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/plays/delete-last`, {
        teamKey,
        setNumber: activeSet,
        playId,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete stat");
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (action: "start" | "end_set" | "complete") => {
    if (action === "end_set" && !window.confirm("End the current set?")) return;
    if (action === "complete") {
      let scoreA = match?.scoreA ?? 0;
      let scoreB = match?.scoreB ?? 0;
      const setsAwarded = scoreA + scoreB;
      // Only fold the live set if it has not already been counted into set wins
      // (e.g. after End set produced 2–0 without opening set 3).
      if (
        liveScore &&
        liveScore.a !== liveScore.b &&
        setsAwarded < currentSet
      ) {
        if (liveScore.a > liveScore.b) scoreA += 1;
        else scoreB += 1;
      }
      if (scoreA === scoreB) {
        window.alert(
          "This match can't be ended yet — the set score is tied. Finish the deciding set first."
        );
        return;
      }
      if (Math.max(scoreA, scoreB) < setRules.setsToWin) {
        window.alert(
          `This match can't be ended yet — a team needs ${setRules.setsToWin} sets to win (currently ${scoreA}–${scoreB}).`
        );
        return;
      }
      if (!window.confirm("End the match? This finalizes standings.")) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/status`, { action });
      setViewedSet(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update match");
    } finally {
      setBusy(false);
    }
  };

  const finishAndSubmit = async () => {
    if (!window.confirm("Finish tracking and submit stats for this team?")) return;
    setBusy(true);
    try {
      await releaseTeamLock();
    } catch {
      // lock may already be gone; still leave
    }
    window.location.assign("/");
  };

  const finishEditing = async () => {
    setBusy(true);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
        action: "relock",
      });
    } catch {
      // still leave even if relock fails
    }
    window.location.assign(`/tournaments/${tournamentId}/matches/${matchId}`);
  };

  const requestUnlock = async () => {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const scope = status === "COMPLETED" ? "match" : "set";
      if (canAdminBypassEdit && status === "COMPLETED") {
        await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
          adminBypass: true,
          scope,
        });
      } else {
        await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
          passcode,
          scope,
          setNumber: scope === "set" ? activeSet : undefined,
        });
      }
      setUnlockDialogOpen(false);
      setPasscode("");
    } catch (e: any) {
      setUnlockError(e?.message ?? "Unlock failed");
    } finally {
      setUnlockBusy(false);
    }
  };

  const relock = async () => {
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
        action: "relock",
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to re-lock");
    }
  };

  const viewedPlays = useMemo(() => {
    const forSet = plays.filter((p) => p.setNumber === activeSet);
    // Live capture: keep a short recent strip. View-only / completed: full set log.
    if (viewOnly || status === "COMPLETED") return forSet;
    return forSet.slice(0, 25);
  }, [plays, activeSet, viewOnly, status]);

  const totalSets = setRules.totalSets;
  const unlockRemainingSec = activeUnlock
    ? Math.max(0, Math.ceil((activeUnlock.expiresAt - nowTick) / 1000))
    : 0;

  const scoreboardProps = {
    totalSets,
    setScores,
    currentSet,
    activeSet,
    teamKey,
    status,
    setIsLocked,
    unlockValid,
    activeUnlock,
    teamAName,
    teamBName,
    trackedTeamName,
    trackedSetsWon,
    trackedSetPoints,
    canAdjustScore,
    busy,
    setPointReached,
    matchDecided,
    viewedSetLocked,
    viewedSetUnlocked,
    viewedSetUnlockedBanner: viewedSetUnlocked && !viewOnly,
    unlockRemainingSec,
    error,
    viewOnly,
    onViewSet: (setNo: number) => {
      setViewedSet(setNo === currentSet && status !== "COMPLETED" ? null : setNo);
    },
    onIncrement: () => void adjustScore(1),
    onDecrement: () => void adjustScore(-1),
    onLifecycle: lifecycle,
    onFinishAndSubmit: finishAndSubmit,
    onFinishEditing: finishEditing,
    editMode,
    onOpenUnlock: () => {
      setUnlockError(null);
      setPasscode("");
      setUnlockDialogOpen(true);
    },
    onRelock: relock,
  };

  const captureProps = {
    roster,
    playerStatsByCategory,
    teamStatsByCategory,
    colors,
    flash,
    recordTap,
    canRecord,
    status,
    viewedSetLocked,
    viewedSetUnlocked,
    activeSet,
    gridColumns,
    playerLayout,
    viewOnly,
  };

  const historyProps = {
    activeSet,
    teamKey,
    viewedPlays,
    canRecord,
    busy,
    playerNames,
    playerNumbers,
    statByKey,
    onDeletePlay: deletePlay,
  };

  const topBarProps = {
    trackedTeamName,
    lockState,
    pendingTaps,
    viewOnly,
    editMode,
    onBack: async () => {
      await releaseTeamLock();
      window.location.assign(
        viewOnly
          ? `/tournaments/${tournamentId}`
          : `/tournaments/${tournamentId}/matches/${matchId}`
      );
    },
    onSignOut: signOut,
  };

  const unlockNeedsPasscode = !(canAdminBypassEdit && status === "COMPLETED");

  const unlockDialog = (
    <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Unlock {status === "COMPLETED" ? "match" : `Set ${activeSet}`}
          </DialogTitle>
          <DialogDescription>
            {unlockNeedsPasscode
              ? "Enter the 4-digit tracker passcode to edit for 10 minutes."
              : "Unlock this completed match for editing (10 minutes). Changes update live stats immediately."}
          </DialogDescription>
        </DialogHeader>
        {unlockNeedsPasscode ? (
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="text-center text-2xl tracking-[0.5em] h-14"
          />
        ) : null}
        {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
        <Button
          className="font-bold"
          onClick={() => void requestUnlock()}
          disabled={unlockBusy || (unlockNeedsPasscode && passcode.length !== 4)}
        >
          {unlockBusy ? "Checking…" : "Unlock"}
        </Button>
      </DialogContent>
    </Dialog>
  );

  if (lockState === "lost") {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Tracking unavailable</h1>
        <p className="text-destructive">
          {error ?? "Another tablet holds the lock for this team."}
        </p>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/matches/${matchId}`}>
            ← Back to team selection
          </Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="h-dvh flex flex-col overflow-hidden">
      {!online && (
        <div className="shrink-0 bg-destructive text-white text-xs font-semibold text-center py-1.5 flex items-center justify-center gap-2">
          <WifiOff className="h-3.5 w-3.5" /> Offline — reconnect to keep recording stats
        </div>
      )}
      {viewOnly && (
        <div className="shrink-0 bg-muted text-muted-foreground text-xs font-semibold text-center py-1.5">
          Viewing completed match — read only
        </div>
      )}
      {editMode && (
        <div className="shrink-0 bg-amber-500/15 text-amber-800 dark:text-amber-200 text-xs font-semibold text-center py-1.5">
          Editing completed match — taps and score changes save live to public stats
        </div>
      )}

      {/* Tablet landscape: fixed 2-column layout, no page scroll */}
      <div className="hidden lg:landscape:flex flex-1 min-h-0 flex-col">
        <TrackTopBar {...topBarProps} />
        <div className="flex-1 min-h-0 grid grid-cols-[3fr_2fr] gap-3 px-3 pb-3">
          <div className="min-h-0 min-w-0 flex flex-col">
            <TrackPlayerGrid {...captureProps} compact />
          </div>
          <div className="min-h-0 min-w-0 flex flex-col gap-2">
            <TrackScoreboardPanel {...scoreboardProps} compact />
            {status !== "UPCOMING" && (
              <TrackRecentPlaysPanel {...historyProps} compact />
            )}
          </div>
        </div>
      </div>

      {/* Phone / portrait: stacked layout with scroll */}
      <div className="lg:landscape:hidden flex-1 min-h-0 overflow-y-auto">
        <TrackTopBar {...topBarProps} className="border-b" />
        <div className="px-4 pb-8 space-y-4">
          <TrackScoreboardPanel {...scoreboardProps} />
          <TrackPlayerGrid {...captureProps} />
          {status !== "UPCOMING" && <TrackRecentPlaysPanel {...historyProps} />}
        </div>
      </div>

      {!viewOnly && unlockDialog}
    </main>
  );
}

function TrackTopBar({
  trackedTeamName,
  lockState,
  pendingTaps,
  viewOnly,
  editMode,
  onBack,
  onSignOut,
  className,
}: {
  trackedTeamName: string;
  lockState: "acquiring" | "held" | "lost";
  pendingTaps: number;
  viewOnly?: boolean;
  editMode?: boolean;
  onBack: () => Promise<void>;
  onSignOut: () => Promise<void>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-background",
        className
      )}
    >
      <button
        type="button"
        onClick={() => void onBack()}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <div className="text-xs text-muted-foreground text-center">
        {viewOnly ? "Viewing" : editMode ? "Editing" : "Tracking"}{" "}
        <strong className="text-foreground">{trackedTeamName}</strong>
        {viewOnly ? (
          <span className="ml-1">· read only</span>
        ) : editMode ? (
          <span className="ml-1 text-amber-600 dark:text-amber-400">· admin edit</span>
        ) : lockState === "held" ? (
          <span className="text-green-500"> · Lock held</span>
        ) : (
          " · Connecting…"
        )}
        {!viewOnly && pendingTaps > 0 && (
          <span className="ml-2 text-primary">saving {pendingTaps}…</span>
        )}
      </div>
      <Button variant="ghost" size="xs" onClick={() => void onSignOut()}>
        Sign out
      </Button>
    </div>
  );
}

type ScoreboardPanelProps = {
  totalSets: number;
  setScores: { a: number; b: number }[];
  currentSet: number;
  activeSet: number;
  teamKey: TeamKey;
  status: MatchDoc["status"];
  setIsLocked: (setNo: number) => boolean;
  unlockValid: boolean;
  activeUnlock: EditUnlock | null;
  teamAName: string;
  teamBName: string;
  trackedTeamName: string;
  trackedSetsWon: number;
  trackedSetPoints: number;
  canAdjustScore: boolean;
  busy: boolean;
  setPointReached: boolean;
  matchDecided: boolean;
  viewedSetLocked: boolean;
  viewedSetUnlocked: boolean;
  viewedSetUnlockedBanner: boolean;
  unlockRemainingSec: number;
  error: string | null;
  onViewSet: (setNo: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onLifecycle: (action: "start" | "end_set" | "complete") => Promise<void>;
  onFinishAndSubmit: () => Promise<void>;
  onFinishEditing?: () => Promise<void>;
  editMode?: boolean;
  onOpenUnlock: () => void;
  onRelock: () => Promise<void>;
  viewOnly?: boolean;
  compact?: boolean;
};

function TrackScoreboardPanel({
  totalSets,
  setScores,
  currentSet,
  activeSet,
  teamKey,
  status,
  setIsLocked,
  unlockValid,
  activeUnlock,
  teamAName,
  teamBName,
  trackedTeamName,
  trackedSetsWon,
  trackedSetPoints,
  canAdjustScore,
  busy,
  setPointReached,
  matchDecided,
  viewedSetLocked,
  viewedSetUnlocked,
  viewedSetUnlockedBanner,
  unlockRemainingSec,
  error,
  onViewSet,
  onIncrement,
  onDecrement,
  onLifecycle,
  onFinishAndSubmit,
  onFinishEditing,
  editMode,
  onOpenUnlock,
  onRelock,
  viewOnly,
  compact,
}: ScoreboardPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card flex flex-col",
        compact ? "shrink-0 px-3 py-2 gap-1" : "px-4 py-2 gap-1.5"
      )}
    >
      {viewedSetUnlockedBanner && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-center font-semibold">
          Editing locked {status === "COMPLETED" ? "match" : `Set ${activeSet}`}
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 w-full">
        {Array.from({ length: totalSets }, (_, i) => i + 1).map((setNo) => {
          const played = setNo <= setScores.length || setNo <= currentSet;
          const locked = setIsLocked(setNo);
          const unlocked = locked && unlockValid && unlockCoversSet(activeUnlock, setNo);
          const score = setScores[setNo - 1];
          const isViewed = setNo === activeSet;
          const scoreA =
            score?.a ?? (setNo === activeSet && status === "IN_PROGRESS" ? 0 : null);
          const scoreB =
            score?.b ?? (setNo === activeSet && status === "IN_PROGRESS" ? 0 : null);
          return (
        <button
              key={setNo}
              type="button"
              onClick={() => {
                if (!played && status !== "COMPLETED") return;
                onViewSet(setNo);
              }}
              disabled={!played && status !== "COMPLETED"}
              title={
                scoreA != null && scoreB != null
                  ? `${teamAName} ${scoreA} – ${scoreB} ${teamBName}`
                  : undefined
              }
              className={cn(
                "flex flex-col items-center rounded-lg border transition-colors",
                compact ? "px-3 py-1 min-w-[4.5rem]" : "px-4 py-2 min-w-24",
                isViewed
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent"
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-0.5">
                Set {setNo}
                {locked &&
                  (unlocked ? (
                    <LockOpen className="h-2.5 w-2.5 text-amber-500" />
                  ) : (
                    <Lock className="h-2.5 w-2.5" />
                  ))}
              </span>
              <span
                className={cn(
                  "font-extrabold tabular-nums flex items-center gap-0.5",
                  compact ? "text-sm" : "text-base"
                )}
              >
                {scoreA != null && scoreB != null ? (
                  <>
                    <span className={teamKey === "A" ? "text-primary" : "text-muted-foreground"}>
                      {scoreA}
                    </span>
                    <span className="text-muted-foreground font-bold">–</span>
                    <span className={teamKey === "B" ? "text-primary" : "text-muted-foreground"}>
                      {scoreB}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "grid w-full items-center gap-2",
          compact ? "grid-cols-[minmax(5.5rem,1fr)_auto_minmax(5.5rem,1fr)]" : "grid-cols-[minmax(6.5rem,1fr)_auto_minmax(6.5rem,1fr)]"
        )}
      >
        <div className="flex flex-col items-stretch justify-center gap-1.5 min-w-0">
          {status === "UPCOMING" && (
            <Button
              onClick={() => void onLifecycle("start")}
              disabled={busy}
              className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
            >
              Start match
            </Button>
          )}
          {status === "IN_PROGRESS" &&
            (setPointReached && !matchDecided ? (
              <Button
                className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
                onClick={() => void onLifecycle("end_set")}
                disabled={busy}
              >
                End set
              </Button>
            ) : !setPointReached && currentSet < totalSets ? (
              <Button
                variant="outline"
                onClick={() => void onLifecycle("end_set")}
                disabled={busy}
                className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
              >
                End set
              </Button>
            ) : null)}
        </div>

        <TrackedScorePanel
          teamName={trackedTeamName}
          setsWon={trackedSetsWon}
          points={trackedSetPoints}
          liveLabel={
            activeSet === currentSet && status === "IN_PROGRESS" ? "Live" : `Set ${activeSet}`
          }
          canAdjust={canAdjustScore}
          busy={busy}
          compact={compact}
          setPointHint={
            setPointReached && activeSet === currentSet
              ? matchDecided
                ? "Match point"
                : "Set point"
              : null
          }
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />

        <div className="flex flex-col items-stretch justify-center gap-1.5 min-w-0">
          {!viewOnly && status === "IN_PROGRESS" &&
            (setPointReached && matchDecided ? (
              <Button
                className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
                onClick={() => void onLifecycle("complete")}
                disabled={busy}
              >
                End match
              </Button>
            ) : !setPointReached ? (
              <Button
                variant="outline"
                onClick={() => void onLifecycle("complete")}
                disabled={busy}
                className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
              >
                End match
              </Button>
            ) : null)}
          {!viewOnly && status === "COMPLETED" && (
            <Button
              onClick={() => void (editMode && onFinishEditing ? onFinishEditing() : onFinishAndSubmit())}
              disabled={busy}
              className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
            >
              {editMode ? "Done editing" : "Finish & submit"}
            </Button>
          )}
          {!viewOnly && viewedSetLocked && !viewedSetUnlocked && (
            <Button
              variant="secondary"
              onClick={onOpenUnlock}
              className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
            >
              <Lock className="h-3 w-3 mr-1" /> Unlock
            </Button>
          )}
          {!viewOnly && viewedSetUnlocked && (
            <Button
              variant="secondary"
              onClick={() => void onRelock()}
              className={compact ? LIFECYCLE_BTN.compact : LIFECYCLE_BTN.normal}
            >
              <LockOpen className="h-3 w-3 mr-1 text-amber-500" />
              Re-lock ({Math.floor(unlockRemainingSec / 60)}:
              {String(unlockRemainingSec % 60).padStart(2, "0")})
            </Button>
          )}
          {viewOnly && (
            <div className="text-[11px] text-center text-muted-foreground font-medium px-1">
              Browse sets for this team&apos;s play log
            </div>
          )}
        </div>
      </div>

      {error && (
        <p
          className={cn(
            "rounded-md border border-red-500/40 bg-red-500/15 px-3 py-2 text-center font-semibold text-red-700 dark:border-red-400/50 dark:bg-red-500/20 dark:text-red-200",
            compact ? "text-xs" : "text-sm"
          )}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

type PlayerGridProps = {
  roster: PlayerRow[];
  playerStatsByCategory: ReturnType<typeof statsGroupedByCategory>;
  teamStatsByCategory: ReturnType<typeof statsGroupedByCategory>;
  colors: TrackerColors;
  flash: string | null;
  recordTap: (playerId: string | null, statKey: string) => void;
  canRecord: boolean;
  status: MatchDoc["status"];
  viewedSetLocked: boolean;
  viewedSetUnlocked: boolean;
  activeSet: number;
  compact?: boolean;
  gridColumns?: 2 | 3;
  playerLayout?: PlayerLayout;
  viewOnly?: boolean;
};

function TrackPlayerGrid({
  roster,
  playerStatsByCategory,
  teamStatsByCategory,
  colors,
  flash,
  recordTap,
  canRecord,
  status,
  viewedSetLocked,
  viewedSetUnlocked,
  activeSet,
  compact,
  gridColumns = 2,
  playerLayout = "grid",
  viewOnly,
}: PlayerGridProps) {
  // Rows layout: line 1 = positive only; line 2 = positive_points then negatives.
  const topRowStats = playerStatsByCategory
    .filter((g) => g.category === "positive")
    .flatMap((g) => g.stats);
  const bottomRowStats = playerStatsByCategory
    .filter((g) => g.category === "positive_points" || g.category === "negative")
    .flatMap((g) => g.stats);
  if (status === "UPCOMING") {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">
        Start the match to begin recording stats.
      </div>
    );
  }

  if (viewOnly) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold mb-2">Roster</div>
        <p className="text-xs text-muted-foreground mb-3">
          Read-only view. Use the set tabs to browse this team&apos;s play log.
        </p>
        <ul className="space-y-1.5">
          {roster.map((p) => (
            <li key={p.id} className="text-sm flex items-baseline gap-2">
              {p.number != null ? (
                <span className="font-mono text-muted-foreground w-6 tabular-nums">
                  #{p.number}
                </span>
              ) : (
                <span className="w-6" />
              )}
              <span className="font-medium">{p.displayName}</span>
            </li>
          ))}
          {roster.length === 0 ? (
            <li className="text-sm text-muted-foreground">No players on this team.</li>
          ) : null}
        </ul>
      </div>
    );
  }

  if (viewedSetLocked && !viewedSetUnlocked) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground gap-2">
        <Lock className="h-4 w-4 shrink-0" />
        {status === "COMPLETED"
          ? "Match locked. Use Unlock to edit stats and points."
          : `Set ${activeSet} locked. Unlock with passcode to edit.`}
      </div>
    );
  }

  if (!canRecord) return null;

  return (
    <div className={cn("flex flex-col min-h-0", compact ? "h-full gap-1.5" : "gap-3")}>
      {teamStatsByCategory.length > 0 && (
        <div className={cn("shrink-0", compact ? "space-y-1" : "space-y-2")}>
          {teamStatsByCategory.map(({ category, stats: catStats }) => (
            <div key={category} className="flex flex-wrap gap-1">
              {catStats.map((s) => (
                <StatButton
                  key={s.key}
                  stat={s}
                  color={colorForCategory(colors, s.category)}
                  flashing={flash === `team:${s.key}`}
                  compact={compact}
                  className="min-w-[4.5rem] max-w-full"
                  onTap={() => recordTap(null, s.key)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {roster.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground">
          No players on this team yet.
        </div>
      ) : playerLayout === "rows" ? (
        <div className={cn("flex flex-col flex-1 min-h-0", compact ? "gap-1" : "gap-1.5")}>
          {roster.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border bg-card flex flex-col min-w-0 flex-1 min-h-0",
                compact ? "gap-0.5 px-1.5 py-1" : "gap-1 px-2 py-1.5"
              )}
            >
              <div
                className={cn(
                  "shrink-0 font-semibold leading-tight text-foreground break-words",
                  compact ? "text-[13px]" : "text-base"
                )}
                title={p.displayName}
              >
                {p.displayName}
              </div>
              <div className={cn("flex items-stretch min-w-0 flex-1", compact ? "gap-1.5" : "gap-2")}>
                <div
                  className={cn(
                    "shrink-0 flex items-center justify-center",
                    compact ? "min-w-10" : "min-w-14"
                  )}
                >
                  <span
                    className={cn(
                      "font-extrabold tabular-nums text-primary leading-none",
                      compact ? "text-2xl" : "text-4xl"
                    )}
                  >
                    {p.number != null ? p.number : "—"}
                  </span>
                </div>
                <div className={cn("flex flex-col flex-1 min-w-0", compact ? "gap-0.5" : "gap-1")}>
                  {topRowStats.length > 0 ? (
                    <div className={cn("flex flex-1 min-w-0", compact ? "gap-1" : "gap-1.5")}>
                      {topRowStats.map((s) => (
                        <StatButton
                          key={s.key}
                          stat={s}
                          color={colorForCategory(colors, s.category)}
                          flashing={flash === `${p.id}:${s.key}`}
                          compact={compact}
                          className="flex-1 min-w-0 px-0.5"
                          onTap={() => recordTap(p.id, s.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                  {bottomRowStats.length > 0 ? (
                    <div className={cn("flex flex-1 min-w-0", compact ? "gap-1" : "gap-1.5")}>
                      {bottomRowStats.map((s) => (
                        <StatButton
                          key={s.key}
                          stat={s}
                          color={colorForCategory(colors, s.category)}
                          flashing={flash === `${p.id}:${s.key}`}
                          compact={compact}
                          className="flex-1 min-w-0 px-0.5"
                          onTap={() => recordTap(p.id, s.key)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid flex-1 min-h-0",
            compact
              ? "grid-cols-3 grid-rows-2 gap-1.5"
              : cn(
                  "gap-3",
                  gridColumns === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
                )
          )}
        >
          {roster.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border bg-card flex flex-col min-h-0 overflow-hidden",
                compact ? "px-1.5 py-1 gap-0.5" : "px-3 py-3 gap-2"
              )}
            >
              <div
                className={cn(
                  "shrink-0 font-extrabold leading-tight break-words",
                  compact ? "text-[13px]" : "text-lg"
                )}
                title={p.displayName}
              >
                {p.displayName}
              </div>
              <div
                className={cn(
                  "flex items-start min-w-0 flex-1",
                  compact ? "gap-1" : "gap-2"
                )}
              >
                {p.number != null ? (
                  <span
                    className={cn(
                      "shrink-0 rounded bg-primary/15 text-primary font-extrabold tabular-nums leading-none self-center",
                      compact ? "px-1.5 py-0.5 text-base" : "px-2 py-1 text-2xl"
                    )}
                  >
                    #{p.number}
                  </span>
                ) : null}
                <div className={cn("flex flex-col flex-1 min-w-0", compact ? "gap-0.5" : "gap-1")}>
                  {playerStatsByCategory.map(({ category, stats: catStats }) => (
                    <div key={category} className="flex flex-wrap gap-0.5 min-h-0">
                      {catStats.map((s) => (
                        <StatButton
                          key={s.key}
                          stat={s}
                          color={colorForCategory(colors, s.category)}
                          flashing={flash === `${p.id}:${s.key}`}
                          compact={compact}
                          onTap={() => recordTap(p.id, s.key)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPlayerLabel(
  playerId: string | null,
  playerNames: Record<string, string>,
  playerNumbers: Record<string, number>
): string {
  if (!playerId) return "Player";
  const name = playerNames[playerId] ?? "Player";
  const num = playerNumbers[playerId];
  return num != null ? `#${num} ${name}` : name;
}

function TrackRecentPlaysPanel({
  activeSet,
  teamKey,
  viewedPlays,
  canRecord,
  busy,
  playerNames,
  playerNumbers,
  statByKey,
  onDeletePlay,
  compact,
}: {
  activeSet: number;
  teamKey: TeamKey;
  viewedPlays: PlayRow[];
  canRecord: boolean;
  busy: boolean;
  playerNames: Record<string, string>;
  playerNumbers: Record<string, number>;
  statByKey: Map<string, TrackerStat>;
  onDeletePlay: (playId: string) => Promise<void>;
  compact?: boolean;
}) {
  // Plays are ordered newest-first; only the tip of the stack may be undone.
  const latestPlayId = viewedPlays[0]?.id ?? null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card flex flex-col min-h-0",
        compact ? "flex-1 px-2 py-2" : "px-4 py-3"
      )}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 mb-1.5">
        <h2 className={cn("font-extrabold tracking-tight", compact ? "text-xs" : "text-base")}>
          Recent — Set {activeSet}
        </h2>
      </div>
      {viewedPlays.length === 0 ? (
        <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-sm")}>
          No activity in this set.
        </p>
      ) : (
        <div className={cn("flex-1 min-h-0 overflow-y-auto", compact ? "space-y-1" : "space-y-2")}>
          {viewedPlays.map((play) => (
            <div
              key={play.id}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-background",
                compact ? "px-2 py-1" : "px-3.5 py-2.5"
              )}
            >
              <div
                className={cn(
                  "text-muted-foreground tabular-nums shrink-0",
                  compact ? "text-[10px] min-w-8" : "text-xs min-w-12"
                )}
              >
                #{play.seq}
              </div>
              <div className={cn("flex-1 truncate", compact ? "text-[11px]" : "text-sm")}>
                {play.kind === "score_adjust" ? (
                  <span>
                    Score {play.delta != null && play.delta > 0 ? "+" : ""}
                    {play.delta ?? 1}
                  </span>
                ) : (
                  play.entries
                    .map((e) =>
                      e.playerId
                        ? `${formatPlayerLabel(e.playerId, playerNames, playerNumbers)} — ${
                            statByKey.get(e.statKey)?.label ?? e.statKey
                          }`
                        : statByKey.get(e.statKey)?.label ?? e.statKey
                    )
                    .join(" · ")
                )}
              </div>
              {canRecord && play.id === latestPlayId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "shrink-0 text-muted-foreground hover:text-destructive",
                    compact ? "h-6 w-6" : "h-8 w-8"
                  )}
                  onClick={() => void onDeletePlay(play.id)}
                  disabled={busy}
                  aria-label={`Undo last play #${play.seq}`}
                  title="Delete last play"
                >
                  <Trash2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatButton({
  stat,
  color,
  flashing,
  onTap,
  compact,
  label,
  className,
}: {
  stat: TrackerStat;
  color: string;
  flashing: boolean;
  onTap: () => void;
  compact?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      title={label ?? stat.label ?? stat.shortLabel}
      className={cn(
        "relative font-bold transition-all select-none active:scale-95 inline-flex items-center justify-center overflow-hidden min-w-0",
        compact ? BTN.compact : BTN.normal,
        flashing && "scale-95 ring-4 ring-white/90 shadow-lg brightness-110",
        className
      )}
      style={{ backgroundColor: color, color: textColorFor(color) }}
    >
      <span className="block w-full truncate text-center leading-tight px-0.5">
        {label ?? stat.shortLabel}
      </span>
      {flashing && (
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
          <Check className={cn("drop-shadow", compact ? "h-4 w-4" : "h-5 w-5")} />
        </span>
      )}
    </button>
  );
}

function TrackedScorePanel({
  teamName,
  setsWon,
  points,
  liveLabel,
  canAdjust,
  busy,
  compact,
  setPointHint,
  onIncrement,
  onDecrement,
}: {
  teamName: string;
  setsWon: number;
  points: number;
  liveLabel: string;
  canAdjust: boolean;
  busy: boolean;
  compact?: boolean;
  setPointHint?: string | null;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className={cn("flex flex-col items-center min-w-0", compact ? "gap-0" : "gap-0.5")}>
      <div
        className={cn(
          "flex items-center justify-center gap-1.5 min-w-0 max-w-full",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        <span className="font-bold text-muted-foreground uppercase tracking-wider shrink-0">
          {liveLabel}
        </span>
        <span className="text-muted-foreground shrink-0">·</span>
        <span
          className={cn(
            "font-extrabold truncate",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {teamName}
        </span>
        {setPointHint ? (
          <>
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="font-semibold text-amber-500 shrink-0">{setPointHint}</span>
          </>
        ) : null}
      </div>
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "rounded-xl font-bold shrink-0",
            compact ? "h-9 w-9 text-lg" : "h-11 w-11 text-xl"
          )}
          disabled={!canAdjust || busy || points <= 0}
          onClick={onDecrement}
          aria-label="Decrease score"
        >
          <Minus className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </Button>
        <div
          className={cn(
            "font-extrabold leading-none tabular-nums text-primary min-w-[3ch] text-center",
            compact ? "text-4xl" : "text-5xl"
          )}
        >
          {points}
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "rounded-xl font-bold shrink-0",
            compact ? "h-9 w-9 text-lg" : "h-11 w-11 text-xl"
          )}
          disabled={!canAdjust || busy}
          onClick={onIncrement}
          aria-label="Increase score"
        >
          <Plus className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </Button>
      </div>
      <div className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}>
        Sets won: {setsWon}
      </div>
    </div>
  );
}
