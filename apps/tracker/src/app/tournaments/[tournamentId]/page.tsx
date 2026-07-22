"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Button, Card, CardContent } from "@bsc/ui";
import { TrackerShell } from "@/components/tracker-shell";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";

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
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("UPCOMING");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilterId>("all");

  useEffect(() => {
    if (loading) return;
    if (!user) window.location.assign("/login");
  }, [loading, user]);

  // Realtime matches + teams so scores update live while games are tracked.
  useEffect(() => {
    if (!user) return;
    const unsubMatches = onSnapshot(
      query(collection(db, "tournaments", tournamentId, "matches"), orderBy("scheduledAt", "asc")),
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchRow[]);
      }
    );
    const unsubTeams = onSnapshot(
      collection(db, "tournaments", tournamentId, "teams"),
      (snap) => {
        setTeamNames(
          Object.fromEntries(snap.docs.map((d) => [d.id, String((d.data() as any)?.name ?? d.id)]))
        );
      }
    );
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

  const name = (teamId: string) => teamNames[teamId] ?? "Team";

  return (
    <TrackerShell>
    <main className="max-w-3xl mx-auto p-6">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight mt-3">Matches</h1>
      <p className="text-muted-foreground mt-1 mb-5">
        Pick a match, then choose which team you&apos;re tracking.
      </p>

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
            return (
              <Link key={m.id} href={`/tournaments/${tournamentId}/matches/${m.id}`}>
                <Card className="hover:bg-muted/40 transition-colors">
                  <CardContent className="py-4 flex items-center justify-between gap-3">
                    <div>
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
                        <span className="capitalize">{m.status.replace("_", " ").toLowerCase()}</span>
                        {m.status === "IN_PROGRESS" && (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                    {m.status !== "UPCOMING" && (
                      <div className="text-right">
                        <div className="text-lg font-extrabold tabular-nums">
                          {m.scoreA ?? 0}–{m.scoreB ?? 0}
                        </div>
                        {m.status === "IN_PROGRESS" && live && (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            Set {set}: {live.a}–{live.b}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
    </TrackerShell>
  );
}
