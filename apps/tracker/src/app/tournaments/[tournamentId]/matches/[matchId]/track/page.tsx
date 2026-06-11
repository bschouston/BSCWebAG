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
import { VOLLEYBALL_STAT_KEYS, derivePointTo } from "@bsc/shared";
import { Button, Card, CardContent, cn } from "@bsc/ui";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";

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
};

type PlayerRow = { id: string; displayName: string; number?: number | null };

type PlayRow = {
  id: string;
  seq: number;
  setNumber: number;
  entries: { playerId: string | null; statKey: string }[];
  pointTo: TeamKey | null;
};

const PLAYER_STAT_KEYS = VOLLEYBALL_STAT_KEYS.filter((s) => s.requiresPlayer);
const HEARTBEAT_MS = 60 * 1000;

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
  // Selected chips for the play being built: "playerId:statKey".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      limit(25)
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

  const statLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of VOLLEYBALL_STAT_KEYS) map[s.key] = s.label;
    return map;
  }, []);

  const toggleChip = (playerId: string, statKey: string) => {
    const id = `${playerId}:${statKey}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const selectionEntries = useMemo(
    () =>
      [...selected].map((id) => {
        const idx = id.indexOf(":");
        return { playerId: id.slice(0, idx), statKey: id.slice(idx + 1) };
      }),
    [selected]
  );

  const selectionOutcome = useMemo(() => {
    try {
      return {
        pointTo: derivePointTo(selectionEntries.map((e) => e.statKey), teamKey),
        error: null,
      };
    } catch (e: any) {
      return { pointTo: null, error: e?.message as string };
    }
  }, [selectionEntries, teamKey]);

  const submitPlay = async (entries: { playerId: string | null; statKey: string }[]) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/plays`, {
        teamKey,
        entries,
      });
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? "Failed to record play");
    } finally {
      setBusy(false);
    }
  };

  const deleteLastPlay = async () => {
    if (!window.confirm("Delete the last recorded play?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tournaments/${tournamentId}/matches/${matchId}/plays/delete-last`, {
        teamKey,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete play");
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

  const currentSet = match?.currentSet ?? 1;
  const live = match?.setScores?.[currentSet - 1] ?? { a: 0, b: 0 };
  const nameA = teamNames[match?.teamAId ?? ""] ?? "Team A";
  const nameB = teamNames[match?.teamBId ?? ""] ?? "Team B";

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
    <main className="max-w-5xl mx-auto px-4 pb-6">
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
          </div>
          <Button variant="ghost" size="xs" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

        <div className="flex items-center justify-center gap-6 mt-2">
          <ScoreSide name={nameA} highlight={teamKey === "A"} sets={match?.scoreA ?? 0} points={live.a} />
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Set {currentSet}
          </div>
          <ScoreSide name={nameB} highlight={teamKey === "B"} sets={match?.scoreB ?? 0} points={live.b} />
        </div>

        {/* Lifecycle + quick actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          {match?.status === "UPCOMING" && (
            <Button onClick={() => void lifecycle("start")} disabled={busy} className="font-bold">
              Start match
            </Button>
          )}
          {match?.status === "IN_PROGRESS" && (
            <>
              <Button
                variant="secondary"
                onClick={() => void submitPlay([{ playerId: null, statKey: "opponent_error" }])}
                disabled={busy}
              >
                Opponent error (+1 us)
              </Button>
              <Button variant="outline" onClick={() => void lifecycle("end_set")} disabled={busy}>
                End set
              </Button>
              <Button variant="outline" onClick={() => void lifecycle("complete")} disabled={busy}>
                End match
              </Button>
            </>
          )}
          {match?.status === "COMPLETED" && (
            <Button onClick={() => void finishAndSubmit()} disabled={busy} className="font-bold">
              Finish &amp; submit
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive text-center mt-2">{error}</p>}
      </div>

      {match?.status === "COMPLETED" ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-muted-foreground">
            Match completed. Review the play history below, then tap Finish &amp; submit.
          </CardContent>
        </Card>
      ) : match?.status === "UPCOMING" ? (
        <Card className="mb-4">
          <CardContent className="py-6 text-center text-muted-foreground">
            Start the match to begin recording plays.
          </CardContent>
        </Card>
      ) : null}

      {/* Roster with stat chips */}
      {match?.status === "IN_PROGRESS" && (
        <>
          {roster.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                No players assigned to this team yet. Ask an admin to assign players in the web
                console.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {roster.map((p) => (
                <Card key={p.id}>
                  <CardContent className="py-3">
                    <div className="font-extrabold mb-2.5">
                      {p.number != null ? (
                        <span className="text-primary mr-1.5">#{p.number}</span>
                      ) : null}
                      {p.displayName}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PLAYER_STAT_KEYS.map((s) => {
                        const active = selected.has(`${p.id}:${s.key}`);
                        return (
                          <button
                            key={s.key}
                            onClick={() => toggleChip(p.id, s.key)}
                            disabled={busy}
                            className={cn(
                              "px-3.5 py-2.5 rounded-lg border text-sm font-semibold transition-colors select-none",
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background hover:bg-muted/60"
                            )}
                          >
                            {s.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Submit play bar */}
          <div className="sticky bottom-0 bg-background border-t mt-4 py-3 flex items-center gap-3">
            <div className="flex-1 text-sm text-muted-foreground">
              {selectionEntries.length === 0 ? (
                "Tap stats under players, then submit the play."
              ) : selectionOutcome.error ? (
                <span className="text-destructive">{selectionOutcome.error}</span>
              ) : (
                <>
                  {selectionEntries.length} stat{selectionEntries.length > 1 ? "s" : ""} selected
                  {selectionOutcome.pointTo && (
                    <span
                      className={cn(
                        "ml-2 font-bold",
                        selectionOutcome.pointTo === teamKey ? "text-green-500" : "text-destructive"
                      )}
                    >
                      point {selectionOutcome.pointTo === teamKey ? "for us" : "against us"}
                    </span>
                  )}
                </>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setSelected(new Set())}
              disabled={busy || selected.size === 0}
            >
              Clear
            </Button>
            <Button
              size="xl"
              className="font-bold"
              onClick={() => void submitPlay(selectionEntries)}
              disabled={busy || selected.size === 0 || !!selectionOutcome.error || lockState !== "held"}
            >
              Submit play
            </Button>
          </div>
        </>
      )}

      {/* Play history */}
      <div className="mt-6">
        <h2 className="text-base font-extrabold tracking-tight mb-3">
          Play history (Team {teamKey})
        </h2>
        {plays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plays recorded yet.</p>
        ) : (
          <div className="grid gap-2">
            {plays.map((play, i) => (
              <div
                key={play.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5"
              >
                <div className="text-xs text-muted-foreground tabular-nums min-w-16">
                  #{play.seq} · S{play.setNumber}
                </div>
                <div className="flex-1 text-sm">
                  {play.entries
                    .map((e) =>
                      e.playerId
                        ? `${playerNames[e.playerId] ?? "Player"} — ${statLabel[e.statKey] ?? e.statKey}`
                        : statLabel[e.statKey] ?? e.statKey
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
                {i === 0 && match?.status !== "COMPLETED" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void deleteLastPlay()}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
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
