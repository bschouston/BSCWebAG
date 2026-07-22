"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@bsc/ui";
import { formatSetScores } from "@bsc/shared";
import { TrackerShell } from "@/components/tracker-shell";
import { db } from "@/lib/firebase/client";
import { profileCanManageTrackerSports, useAuth } from "@/lib/auth-context";

type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  courtNumber?: number;
  scheduledAt?: { seconds?: number; _seconds?: number; toDate?: () => Date } | null;
  phase?: string;
  bracketMatchId?: string;
};

const STATUS_FILTERS = ["UPCOMING", "IN_PROGRESS", "COMPLETED"] as const;
const PHASE_FILTERS = [
  { id: "all", label: "All" },
  { id: "rr", label: "Round Robin" },
  { id: "playoffs", label: "Playoffs" },
] as const;

type PhaseFilterId = (typeof PHASE_FILTERS)[number]["id"];

function matchDate(m: MatchRow): Date | null {
  const raw = m.scheduledAt;
  if (!raw) return null;
  if (typeof raw.toDate === "function") {
    const d = raw.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const secs = raw.seconds ?? raw._seconds;
  if (secs == null) return null;
  const d = new Date(secs * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMatchWhen(m: MatchRow): string | null {
  const d = matchDate(m);
  if (!d) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, profile, loading } = useAuth();
  const isTrackerAdmin = profileCanManageTrackerSports(profile);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("UPCOMING");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilterId>("all");
  const [simulatingId, setSimulatingId] = useState<string | null>(null);
  const [simulatingAll, setSimulatingAll] = useState(false);
  const [simulateAllOpen, setSimulateAllOpen] = useState(false);
  const [simulateTyped, setSimulateTyped] = useState("");
  const [simMessage, setSimMessage] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) window.location.assign("/login");
  }, [loading, user]);

  useEffect(() => {
    if (!simulateAllOpen) setSimulateTyped("");
  }, [simulateAllOpen]);

  // Realtime matches + teams so scores update live while games are tracked.
  useEffect(() => {
    if (!user) return;
    const unsubMatches = onSnapshot(
      query(collection(db, "tournaments", tournamentId, "matches"), orderBy("scheduledAt", "asc")),
      (snap) => {
        setMatches(
          snap.docs.map((d) => {
            const data = d.data() as Omit<MatchRow, "id">;
            return { id: d.id, ...data };
          })
        );
      },
      () => setMatches([])
    );
    const unsubTeams = onSnapshot(collection(db, "tournaments", tournamentId, "teams"), (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        map[d.id] = String((d.data() as { name?: string }).name ?? d.id);
      });
      setTeamNames(map);
    });
    return () => {
      unsubMatches();
      unsubTeams();
    };
  }, [user, tournamentId]);

  const filtered = useMemo(() => {
    return (matches ?? []).filter((m) => {
      if (m.status !== statusFilter) return false;
      if (phaseFilter === "playoffs") return m.phase === "PLAYOFF";
      if (phaseFilter === "rr") return m.phase !== "PLAYOFF";
      return true;
    });
  }, [matches, statusFilter, phaseFilter]);

  const upcomingCount = useMemo(
    () => (matches ?? []).filter((m) => m.status === "UPCOMING").length,
    [matches]
  );

  const name = (teamId: string) => teamNames[teamId] ?? "Team";

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const simulateOne = async (matchId: string) => {
    setSimulatingId(matchId);
    setSimError(null);
    setSimMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/tournaments/${tournamentId}/matches/${matchId}/simulate`,
        { method: "POST", headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Simulation failed");
      setSimMessage(
        `Simulated match → ${data.scoreA}–${data.scoreB} (${data.playsWritten ?? 0} plays)`
      );
    } catch (err) {
      setSimError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setSimulatingId(null);
    }
  };

  const confirmSimulateAll = async () => {
    setSimulatingAll(true);
    setSimError(null);
    setSimMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/simulate-all`, {
        method: "POST",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Simulate all failed");
      const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
      setSimMessage(
        `Simulated ${data.simulatedCount ?? 0} match(es)` +
          (skipped ? `; skipped ${skipped}` : "")
      );
      setSimulateAllOpen(false);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : "Simulate all failed");
    } finally {
      setSimulatingAll(false);
    }
  };

  const canConfirmSimulateAll =
    simulateTyped.trim().toLowerCase() === "simulate" && !simulatingAll;

  return (
    <TrackerShell>
      <main className="max-w-3xl mx-auto p-6">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Matches</h1>
            <p className="text-muted-foreground mt-1 mb-2">
              Pick a match, then choose which team you&apos;re tracking.
            </p>
          </div>
          {isTrackerAdmin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={simulatingAll || upcomingCount === 0}
              title={
                upcomingCount === 0
                  ? "No upcoming matches to simulate"
                  : "Fill all upcoming matches with random completed results"
              }
              onClick={() => setSimulateAllOpen(true)}
            >
              {simulatingAll ? "Simulating…" : "Simulate all upcoming"}
            </Button>
          ) : null}
        </div>

        {simMessage ? (
          <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{simMessage}</p>
        ) : null}
        {simError ? <p className="mb-3 text-sm text-destructive">{simError}</p> : null}

        <div className="flex flex-wrap gap-2 mb-2">
          {PHASE_FILTERS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={phaseFilter === p.id ? "default" : "outline"}
              onClick={() => setPhaseFilter(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s.replace("_", " ").toLowerCase()}
            </Button>
          ))}
        </div>

        {matches === null ? (
          <div className="text-muted-foreground">Loading matches…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No matches in this state.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((m) => {
              const set = m.currentSet ?? 1;
              const live = m.setScores?.[set - 1];
              const when = formatMatchWhen(m);
              const isPlayoff = m.phase === "PLAYOFF";
              const canSimulate = isTrackerAdmin && m.status === "UPCOMING";
              const setScoresLabel = formatSetScores(m.setScores);
              return (
                <Link key={m.id} href={`/tournaments/${tournamentId}/matches/${m.id}`}>
                  <Card className="hover:bg-muted/40 transition-colors">
                    <CardContent className="py-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">
                          {isPlayoff && m.bracketMatchId ? (
                            <span className="font-mono text-teal-700 dark:text-teal-400 mr-1.5">
                              {m.bracketMatchId}
                            </span>
                          ) : null}
                          {name(m.teamAId)}{" "}
                          <span className="text-muted-foreground font-normal">vs</span>{" "}
                          {name(m.teamBId)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {when ? <span className="mr-1.5">{when}</span> : null}
                          {m.courtNumber != null && (
                            <span className="mr-1.5">Court {m.courtNumber}</span>
                          )}
                          {isPlayoff ? (
                            <span className="mr-1.5 font-medium text-teal-700 dark:text-teal-400">
                              Playoff
                            </span>
                          ) : null}
                          <span className="capitalize">
                            {m.status.replace("_", " ").toLowerCase()}
                          </span>
                          {m.status === "IN_PROGRESS" && (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse align-middle" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.status !== "UPCOMING" && (
                          <div className="text-right">
                            <div className="text-lg font-extrabold tabular-nums">
                              {m.scoreA ?? 0}–{m.scoreB ?? 0}
                            </div>
                            {setScoresLabel ? (
                              <div className="text-xs text-muted-foreground tabular-nums max-w-[11rem]">
                                {setScoresLabel}
                              </div>
                            ) : m.status === "IN_PROGRESS" && live ? (
                              <div className="text-xs text-muted-foreground tabular-nums">
                                Set {set}: {live.a}–{live.b}
                              </div>
                            ) : null}
                          </div>
                        )}
                        {isTrackerAdmin ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canSimulate || simulatingId === m.id || simulatingAll}
                            title={
                              canSimulate
                                ? "Fill with random plays and complete the match"
                                : "Only upcoming matches can be simulated"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void simulateOne(m.id);
                            }}
                          >
                            {simulatingId === m.id ? "…" : "Simulate"}
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <Dialog open={simulateAllOpen} onOpenChange={setSimulateAllOpen}>
          <DialogContent className="max-w-md" showCloseButton={!simulatingAll}>
            <DialogHeader>
              <DialogTitle>Simulate all upcoming matches?</DialogTitle>
              <DialogDescription>
                Each upcoming match gets random plays and a completed score. In-progress and
                completed matches are skipped. For testing only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-simulate-all">
                Type <span className="font-mono font-semibold">simulate</span> to confirm
              </Label>
              <Input
                id="confirm-simulate-all"
                autoComplete="off"
                value={simulateTyped}
                disabled={simulatingAll}
                onChange={(e) => setSimulateTyped(e.target.value)}
                placeholder="simulate"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={simulatingAll}
                onClick={() => setSimulateAllOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canConfirmSimulateAll}
                onClick={() => void confirmSimulateAll()}
              >
                {simulatingAll ? "Simulating…" : "Simulate all"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TrackerShell>
  );
}
