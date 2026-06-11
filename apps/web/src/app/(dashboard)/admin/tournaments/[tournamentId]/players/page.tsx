"use client";

import { useEffect, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlayerRow = {
  id: string;
  displayName: string;
  number?: number | null;
  teamId?: string | null;
};
type TeamRow = { id: string; name: string };

export default function PlayersPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Local jersey-number drafts keyed by player id.
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const [playersRes, teamsRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/players`, { headers }),
      fetch(`/api/tournaments/${tournamentId}/teams`, { headers }),
    ]);
    const playersData = await playersRes.json();
    const teamsData = await teamsRes.json();
    const players: PlayerRow[] = playersData.players ?? [];
    setRows(players);
    setTeams(teamsData.teams ?? []);
    setNumberDrafts(
      Object.fromEntries(players.map((p) => [p.id, p.number != null ? String(p.number) : ""]))
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const add = async () => {
    setSubmitting(true);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        displayName,
        number: newNumber.trim() === "" ? null : Number(newNumber),
      }),
    });
    setDisplayName("");
    setNewNumber("");
    await load();
    setSubmitting(false);
  };

  const saveNumber = async (player: PlayerRow) => {
    const draft = (numberDrafts[player.id] ?? "").trim();
    const next = draft === "" ? null : Number(draft);
    if (draft !== "" && !Number.isFinite(next)) return;
    const current = player.number ?? null;
    if (next === current) return;

    setBusyId(player.id);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/players/${player.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ number: next }),
    });
    setRows((prev) => prev.map((p) => (p.id === player.id ? { ...p, number: next } : p)));
    setBusyId(null);
  };

  const remove = async (playerId: string) => {
    if (!window.confirm("Delete this player?")) return;
    setBusyId(playerId);
    const token = await user?.getIdToken();
    await fetch(`/api/tournaments/${tournamentId}/players/${playerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setRows((prev) => prev.filter((p) => p.id !== playerId));
    setBusyId(null);
  };

  const teamName = (teamId?: string | null) =>
    teams.find((t) => t.id === teamId)?.name ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add player</CardTitle>
          <CardDescription>Assign players to teams from the Teams tab.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1">
              <Label>Player name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Jersey #</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <Button disabled={!displayName.trim() || submitting} onClick={add}>
            {submitting ? "Adding…" : "Add player"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Players ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground">No players yet.</div>
          ) : (
            <ul className="space-y-2">
              {rows.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{p.displayName}</span>
                    {teamName(p.teamId) ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {teamName(p.teamId)}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground/60">Unassigned</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">#</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="w-20 h-8"
                        value={numberDrafts[p.id] ?? ""}
                        onChange={(e) =>
                          setNumberDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        onBlur={() => void saveNumber(p)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        disabled={busyId === p.id}
                        placeholder="—"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void remove(p.id)}
                      disabled={busyId === p.id}
                    >
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
