"use client";

import { useEffect, useState, use } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TeamRow = { id: string; name: string };
type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: string;
  scoreA?: number;
  scoreB?: number;
  playSeq?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  scheduledAt?: { _seconds?: number; seconds?: number } | null;
};

export default function SchedulePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [iframeHtml, setIframeHtml] = useState<string>("");
  const [savingIframe, setSavingIframe] = useState(false);
  const [teamAId, setTeamAId] = useState<string>("");
  const [teamBId, setTeamBId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const teamsRes = await fetch(`/api/tournaments/${tournamentId}/teams`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const teamsData = await teamsRes.json();
    setTeams(teamsData.teams ?? []);

    // Load current iframe embed code for the public Live page
    try {
      const tRes = await fetch(`/api/tournaments/${tournamentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (tRes.ok) {
        const tData = await tRes.json();
        setIframeHtml(String(tData?.tournament?.publicIframeEmbedHtml ?? ""));
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Matches stream in realtime so live scores from the tracker show up here.
  useEffect(() => {
    if (!user || !db) return;
    const q = query(
      collection(db, "tournaments", tournamentId, "matches"),
      orderBy("scheduledAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchRow[]);
    });
  }, [user, tournamentId]);

  const saveIframe = async () => {
    setSavingIframe(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ publicIframeEmbedHtml: iframeHtml || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save embed");
      }
      await load();
    } finally {
      setSavingIframe(false);
    }
  };

  const add = async () => {
    setSubmitting(true);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        teamAId,
        teamBId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: "UPCOMING",
      }),
    });
    setTeamAId("");
    setTeamBId("");
    setScheduledAt("");
    await load();
    setSubmitting(false);
  };

  const removeMatch = async (matchId: string) => {
    if (!window.confirm("Delete this match?")) return;
    const token = await user?.getIdToken();
    const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Failed to delete match");
      return;
    }
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  };

  const forceReleaseLocks = async (matchId: string) => {
    if (!window.confirm("Force release tracker locks for this match?")) return;
    const token = await user?.getIdToken();
    const res = await fetch(
      `/api/tournaments/${tournamentId}/matches/${matchId}/release-locks`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data?.error ?? "Failed to release locks");
    } else {
      window.alert("Locks released.");
    }
  };

  const teamName = (teamId: string) => teams.find((t) => t.id === teamId)?.name ?? teamId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Public Live page</CardTitle>
          <CardDescription>
            This content appears on the public Live page at{" "}
            <span className="font-mono text-xs">/live/{tournamentId}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Google Sheet iframe embed code</Label>
            <Textarea
              value={iframeHtml}
              onChange={(e) => setIframeHtml(e.target.value)}
              placeholder='<iframe src="..." width="100%" height="800"></iframe>'
              className="min-h-[160px] font-mono text-xs"
            />
          </div>
          <Button onClick={saveIframe} disabled={savingIframe}>
            {savingIframe ? "Saving…" : "Save embed"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create match</CardTitle>
          <CardDescription>Define the schedule your trackers will see.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Team A</Label>
              <Select value={teamAId} onValueChange={setTeamAId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
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
              <Select value={teamBId} onValueChange={setTeamBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
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
          </div>

          <div className="space-y-1">
            <Label>Scheduled time</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          <Button
            disabled={submitting || !teamAId || !teamBId || teamAId === teamBId}
            onClick={add}
          >
            {submitting ? "Creating…" : "Create match"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : matches.length === 0 ? (
            <div className="text-muted-foreground">No matches yet.</div>
          ) : (
            <ul className="space-y-2">
              {matches.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div>
                    <div className="font-medium">
                      {teamName(m.teamAId)} vs {teamName(m.teamBId)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Status: {m.status}
                      {m.status !== "UPCOMING" && (
                        <span className="ml-2 tabular-nums">
                          Sets {m.scoreA ?? 0}–{m.scoreB ?? 0}
                        </span>
                      )}
                      {m.status === "IN_PROGRESS" && (
                        <span className="ml-2 tabular-nums font-medium text-foreground">
                          · Set {m.currentSet ?? 1}:{" "}
                          {m.setScores?.[(m.currentSet ?? 1) - 1]?.a ?? 0}–
                          {m.setScores?.[(m.currentSet ?? 1) - 1]?.b ?? 0}
                          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void forceReleaseLocks(m.id)}
                    >
                      Release locks
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void removeMatch(m.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

