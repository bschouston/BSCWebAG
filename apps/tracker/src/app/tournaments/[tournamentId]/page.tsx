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
  scheduledAt?: { seconds?: number; _seconds?: number } | null;
};

const FILTERS = ["UPCOMING", "IN_PROGRESS", "COMPLETED"] as const;

export default function TournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("UPCOMING");

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

  const filtered = useMemo(
    () => (matches ?? []).filter((m) => m.status === filter),
    [matches, filter]
  );

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

      <div className="flex gap-2 mb-4">
        {FILTERS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
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
            return (
              <Link key={m.id} href={`/tournaments/${tournamentId}/matches/${m.id}`}>
                <Card className="hover:bg-muted/40 transition-colors">
                  <CardContent className="py-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold">
                        {name(m.teamAId)}{" "}
                        <span className="text-muted-foreground font-normal">vs</span>{" "}
                        {name(m.teamBId)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {m.courtNumber != null && (
                          <span className="mr-1.5 normal-case">Court {m.courtNumber}</span>
                        )}
                        {m.status.replace("_", " ").toLowerCase()}
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
