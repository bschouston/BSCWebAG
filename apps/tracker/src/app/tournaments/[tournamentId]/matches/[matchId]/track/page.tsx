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
import { Lock, LockOpen, WifiOff } from "lucide-react";
import {
  DEFAULT_SET_RULES,
  DEFAULT_TRACKER_COLORS,
  DEFAULT_TRACKER_LAYOUT,
  applyManualScoringPolicy,
  isSetComplete,
  type SetRules,
  type StatCategory,
  type TrackerColors,
  type TrackerStat,
} from "@bsc/shared";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@bsc/ui";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";
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
};

const HEARTBEAT_MS = 60 * 1000;

/** Display order for stat category rows (each color gets its own row). */
const STAT_CATEGORY_ORDER: StatCategory[] = ["positive", "negative"];

function statsGroupedByCategory(stats: TrackerStat[]) {
  const grouped = new Map<StatCategory, TrackerStat[]>(
    STAT_CATEGORY_ORDER.map((cat) => [cat, []])
  );
  for (const stat of stats) {
    grouped.get(stat.category)?.push(stat);
  }
  return STAT_CATEGORY_ORDER.map((category) => ({
    category,
    stats: grouped.get(category) ?? [],
  })).filter((row) => row.stats.length > 0);
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
  const { user, loading, signOut } = useAuth();
  const search = useSearchParams();
  const teamKey = (search.get("team") ?? "A") as TeamKey;

  const [lockState, setLockState] = useState<"acquiring" | "held" | "lost">("acquiring");
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [roster, setRoster] = useState<PlayerRow[]>([]);
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [sport, setSport] = useState<string | null>(null);

  const [stats, setStats] = useState<TrackerStat[]>([]);
  const [colors, setColors] = useState<TrackerColors>(DEFAULT_TRACKER_COLORS);
  const [gridColumns, setGridColumns] = useState<2 | 3>(DEFAULT_TRACKER_LAYOUT.playerGridColumns);
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
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
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

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, tournamentId, matchId, teamKey]);

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
      const { config } = applyManualScoringPolicy(raw as any);
      setStats([...config.stats].sort((a, b) => a.order - b.order));
      setColors(config.colors);
      if (config.layout?.playerGridColumns) setGridColumns(config.layout.playerGridColumns);
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

  // This team's play history (latest first).
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "tournaments", tournamentId, "matches", matchId, "plays"),
      where("teamKey", "==", teamKey),
      where("deleted", "==", false),
      orderBy("seq", "desc"),
      limit(40)
    );
    return onSnapshot(q, (snap) => {
      setPlays(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlayRow[]);
    });
  }, [user, tournamentId, matchId, teamKey]);

  const playerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roster) map[p.id] = p.displayName;
    return map;
  }, [roster]);

  const statByKey = useMemo(() => new Map(stats.map((s) => [s.key, s])), [stats]);
  const enabledStats = useMemo(() => stats.filter((s) => s.enabled), [stats]);
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
  const nameA = teamNames[match?.teamAId ?? ""] ?? "Team A";
  const nameB = teamNames[match?.teamBId ?? ""] ?? "Team B";

  // Locking state for the viewed set.
  const activeUnlock = match ? getActiveUnlock({ editUnlock: match.editUnlock }) : null;
  // nowTick keeps this re-evaluating as expiry approaches.
  const unlockValid = !!activeUnlock && activeUnlock.expiresAt > nowTick;
  const setIsLocked = (setNo: number) =>
    status === "COMPLETED" || (status === "IN_PROGRESS" && setNo < currentSet);
  const viewedSetLocked = setIsLocked(activeSet);
  const viewedSetUnlocked =
    viewedSetLocked && unlockValid && unlockCoversSet(activeUnlock, activeSet);

  const canRecord =
    (!viewedSetLocked && status === "IN_PROGRESS" && lockState === "held" && activeSet === currentSet) ||
    viewedSetUnlocked;

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
    setTimeout(() => setFlash((f) => (f === flashId ? null : f)), 350);
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

  const deleteLastPlay = async () => {
    if (!window.confirm(`Delete the last recorded stat in Set ${activeSet}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/plays/delete-last`, {
        teamKey,
        setNumber: activeSet,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete stat");
    } finally {
      setBusy(false);
    }
  };

  const lifecycle = async (action: "start" | "end_set" | "complete") => {
    if (action === "end_set" && !window.confirm("End the current set?")) return;
    if (action === "complete" && !window.confirm("End the match? This finalizes standings."))
      return;
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
      await api("/api/locks/release", { tournamentId, matchId, teamKey });
    } catch {
      // lock may already be gone; still leave
    }
    window.location.assign("/");
  };

  const requestUnlock = async () => {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const scope = status === "COMPLETED" ? "match" : "set";
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/unlock`, {
        passcode,
        scope,
        setNumber: scope === "set" ? activeSet : undefined,
      });
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

  const viewedPlays = useMemo(
    () => plays.filter((p) => p.setNumber === activeSet).slice(0, 6),
    [plays, activeSet]
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

  const totalSets = setRules.totalSets;
  const unlockRemainingSec = activeUnlock
    ? Math.max(0, Math.ceil((activeUnlock.expiresAt - nowTick) / 1000))
    : 0;

  return (
    <main className="max-w-6xl mx-auto px-4 pb-10">
      {/* Offline banner */}
      {!online && (
        <div className="sticky top-0 z-30 -mx-4 bg-destructive text-white text-sm font-semibold text-center py-2 flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" /> Offline — reconnect to keep recording stats
        </div>
      )}

      {/* Header / scoreboard */}
      <div className="sticky top-0 z-10 bg-background border-b pb-3 mb-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/tournaments/${tournamentId}/matches/${matchId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
          <div className="text-xs text-muted-foreground">
            Tracking <strong className="text-foreground">Team {teamKey}</strong> ·{" "}
            {lockState === "held" ? (
              <span className="text-green-500">Lock held</span>
            ) : (
              "Connecting…"
            )}
            {pendingTaps > 0 && (
              <span className="ml-2 text-primary">saving {pendingTaps}…</span>
            )}
          </div>
          <Button variant="ghost" size="xs" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

        {/* Set bar */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {Array.from({ length: totalSets }, (_, i) => i + 1).map((setNo) => {
            const played = setNo <= setScores.length || setNo <= currentSet;
            const locked = setIsLocked(setNo);
            const unlocked = locked && unlockValid && unlockCoversSet(activeUnlock, setNo);
            const score = setScores[setNo - 1];
            const isViewed = setNo === activeSet;
            return (
              <button
                key={setNo}
                onClick={() => {
                  if (!played && status !== "COMPLETED") return;
                  setViewedSet(setNo === currentSet && status !== "COMPLETED" ? null : setNo);
                }}
                disabled={!played && status !== "COMPLETED"}
                className={cn(
                  "flex flex-col items-center rounded-xl border px-4 py-2 min-w-24 transition-colors",
                  isViewed
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent"
                )}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  Set {setNo}
                  {locked &&
                    (unlocked ? (
                      <LockOpen className="h-3 w-3 text-amber-500" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    ))}
                </span>
                <span className="text-lg font-extrabold tabular-nums">
                  {score ? `${score.a}–${score.b}` : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 mt-2">
          <ScoreSide
            name={nameA}
            highlight={teamKey === "A"}
            sets={match?.scoreA ?? 0}
            points={viewedScore.a}
          />
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {activeSet === currentSet && status === "IN_PROGRESS" ? "Live" : `Set ${activeSet}`}
          </div>
          <ScoreSide
            name={nameB}
            highlight={teamKey === "B"}
            sets={match?.scoreB ?? 0}
            points={viewedScore.b}
          />
        </div>

        {/* Set-point / match prompts */}
        {setPointReached && activeSet === currentSet && (
          <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="font-semibold">
              {matchDecided ? "Match point reached." : "Set point reached."}
            </span>
            {matchDecided ? (
              <Button size="sm" className="font-bold" onClick={() => void lifecycle("complete")} disabled={busy}>
                End match
              </Button>
            ) : (
              <Button size="sm" className="font-bold" onClick={() => void lifecycle("end_set")} disabled={busy}>
                End set
              </Button>
            )}
          </div>
        )}

        {/* Lifecycle actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          {status === "UPCOMING" && (
            <Button onClick={() => void lifecycle("start")} disabled={busy} className="font-bold">
              Start match
            </Button>
          )}
          {status === "IN_PROGRESS" && !setPointReached && (
            <>
              {currentSet < totalSets && (
                <Button variant="outline" onClick={() => void lifecycle("end_set")} disabled={busy}>
                  End set
                </Button>
              )}
              <Button variant="outline" onClick={() => void lifecycle("complete")} disabled={busy}>
                End match
              </Button>
            </>
          )}
          {status === "COMPLETED" && (
            <Button onClick={() => void finishAndSubmit()} disabled={busy} className="font-bold">
              Finish &amp; submit
            </Button>
          )}

          {/* Locked-set unlock controls */}
          {viewedSetLocked && !viewedSetUnlocked && (
            <Button
              variant="secondary"
              onClick={() => {
                setUnlockError(null);
                setPasscode("");
                setUnlockDialogOpen(true);
              }}
            >
              <Lock className="h-3.5 w-3.5 mr-1" /> Unlock to edit
            </Button>
          )}
          {viewedSetUnlocked && (
            <Button variant="secondary" onClick={() => void relock()}>
              <LockOpen className="h-3.5 w-3.5 mr-1 text-amber-500" />
              Re-lock now ({Math.floor(unlockRemainingSec / 60)}:
              {String(unlockRemainingSec % 60).padStart(2, "0")})
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive text-center mt-2">{error}</p>}
      </div>

      {status === "UPCOMING" ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-muted-foreground">
            Start the match to begin recording stats.
          </CardContent>
        </Card>
      ) : viewedSetLocked && !viewedSetUnlocked ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Lock className="h-4 w-4" />
            {status === "COMPLETED"
              ? "Match completed and locked. Unlock with the passcode to edit stats."
              : `Set ${activeSet} is finished and locked. Unlock with the passcode to edit.`}
          </CardContent>
        </Card>
      ) : null}

      {/* Capture area */}
      {canRecord && (
        <>
          {viewedSetUnlocked && (
            <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-center font-semibold">
              Editing locked {status === "COMPLETED" ? "match" : `Set ${activeSet}`} — changes
              adjust scores and stats directly.
            </div>
          )}

          {/* Team-level stats — one row per category/color */}
          {teamStatsByCategory.length > 0 && (
            <div className="space-y-2 mb-4">
              {teamStatsByCategory.map(({ category, stats: catStats }) => (
                <div key={category} className="flex flex-wrap justify-center gap-2">
                  {catStats.map((s) => {
                    const bg = colors[s.category];
                    const flashing = flash === `team:${s.key}`;
                    return (
                      <button
                        key={s.key}
                        onClick={() => recordTap(null, s.key)}
                        className={cn(
                          "px-5 py-3 rounded-xl text-sm font-bold transition-transform select-none",
                          flashing && "scale-95 ring-2 ring-white/60"
                        )}
                        style={{ backgroundColor: bg, color: textColorFor(bg) }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Player grid */}
          {roster.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                No players assigned to this team yet. Ask an admin to assign players in the web
                console.
              </CardContent>
            </Card>
          ) : (
            <div
              className={cn(
                "grid gap-3",
                gridColumns === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
              )}
            >
              {roster.map((p) => (
                <Card key={p.id} className="overflow-hidden">
                  <CardContent className="py-3 px-3 space-y-2.5">
                    <div className="font-extrabold truncate">
                      {p.number != null ? (
                        <span className="text-primary mr-1.5">#{p.number}</span>
                      ) : null}
                      {p.displayName}
                    </div>

                    {/* One row per stat category (each color on its own row) */}
                    {playerStatsByCategory.map(({ category, stats: catStats }) => (
                      <div key={category} className="flex flex-wrap gap-1.5">
                        {catStats.map((s) => (
                          <StatButton
                            key={s.key}
                            stat={s}
                            color={colors[s.category]}
                            flashing={flash === `${p.id}:${s.key}`}
                            onTap={() => recordTap(p.id, s.key)}
                          />
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Recent plays in the viewed set */}
      {status !== "UPCOMING" && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold tracking-tight">
              Recent — Set {activeSet} (Team {teamKey})
            </h2>
            {canRecord && viewedPlays.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void deleteLastPlay()} disabled={busy}>
                Delete last stat
              </Button>
            )}
          </div>
          {viewedPlays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stats recorded in this set.</p>
          ) : (
            <div className="grid gap-2">
              {viewedPlays.map((play) => (
                <div
                  key={play.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5"
                >
                  <div className="text-xs text-muted-foreground tabular-nums min-w-12">
                    #{play.seq}
                  </div>
                  <div className="flex-1 text-sm">
                    {play.entries
                      .map((e) =>
                        e.playerId
                          ? `${playerNames[e.playerId] ?? "Player"} — ${
                              statByKey.get(e.statKey)?.label ?? e.statKey
                            }`
                          : statByKey.get(e.statKey)?.label ?? e.statKey
                      )
                      .join(" · ")}
                  </div>
                  {play.pointTo && (
                    <span
                      className={cn(
                        "text-xs font-bold whitespace-nowrap",
                        play.pointTo === teamKey ? "text-green-500" : "text-destructive"
                      )}
                    >
                      {play.pointTo === teamKey ? "+1 us" : "+1 them"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Passcode dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Unlock {status === "COMPLETED" ? "match" : `Set ${activeSet}`}
            </DialogTitle>
            <DialogDescription>
              Enter the 4-digit tracker passcode to edit for 10 minutes.
            </DialogDescription>
          </DialogHeader>
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
          {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
          <Button
            className="font-bold"
            onClick={() => void requestUnlock()}
            disabled={unlockBusy || passcode.length !== 4}
          >
            {unlockBusy ? "Checking…" : "Unlock"}
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function StatButton({
  stat,
  color,
  flashing,
  onTap,
}: {
  stat: TrackerStat;
  color: string;
  flashing: boolean;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={cn(
        "px-3 py-2.5 rounded-lg text-sm font-bold transition-transform select-none active:scale-95",
        flashing && "scale-95 ring-2 ring-white/60"
      )}
      style={{ backgroundColor: color, color: textColorFor(color) }}
    >
      {stat.shortLabel}
    </button>
  );
}

function ScoreSide({
  name,
  highlight,
  sets,
  points,
}: {
  name: string;
  highlight: boolean;
  sets: number;
  points: number;
}) {
  return (
    <div className="text-center min-w-28">
      <div
        className={cn(
          "text-sm truncate max-w-36",
          highlight ? "font-extrabold" : "font-medium text-muted-foreground"
        )}
      >
        {name}
      </div>
      <div className={cn("text-4xl font-extrabold leading-tight tabular-nums", highlight && "text-primary")}>
        {points}
      </div>
      <div className="text-[11px] text-muted-foreground">Sets: {sets}</div>
    </div>
  );
}
