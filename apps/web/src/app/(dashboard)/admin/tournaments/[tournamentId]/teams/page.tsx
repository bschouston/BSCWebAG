"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readableMutedTextColor, readableTextColor } from "@/lib/color-contrast";

type TeamRow = { id: string; name: string; color?: string | null };
type PlayerRow = {
  id: string;
  displayName: string;
  number?: number | null;
  teamId?: string | null;
};

const DEFAULT_COLOR = "#1a3556";

export default function TeamsPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    const headers = await authHeaders();
    const [teamsRes, playersRes] = await Promise.all([
      fetch(`/api/tournaments/${tournamentId}/teams`, { headers }),
      fetch(`/api/tournaments/${tournamentId}/players`, { headers }),
    ]);
    const teamsData = await teamsRes.json();
    const playersData = await playersRes.json();
    setRows(teamsData.teams ?? []);
    setPlayers(playersData.players ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const add = async () => {
    setSubmitting(true);
    const headers = await authHeaders();
    await fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name, color: newColor }),
    });
    setName("");
    setNewColor(DEFAULT_COLOR);
    await load();
    setSubmitting(false);
  };

  const patchTeam = async (teamId: string, body: Record<string, unknown>) => {
    const headers = await authHeaders();
    await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  };

  const saveEdit = async (teamId: string) => {
    setBusyId(teamId);
    await patchTeam(teamId, { name: editName, color: editColor });
    setRows((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, name: editName, color: editColor } : t))
    );
    setEditingId(null);
    setBusyId(null);
  };

  const remove = async (teamId: string) => {
    if (!window.confirm("Delete this team? Players will be unassigned.")) return;
    setBusyId(teamId);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to delete team");
    } else {
      setRows((prev) => prev.filter((t) => t.id !== teamId));
      setPlayers((prev) =>
        prev.map((p) => (p.teamId === teamId ? { ...p, teamId: null } : p))
      );
    }
    setBusyId(null);
  };

  const assignPlayer = async (playerId: string, teamId: string | null) => {
    const headers = await authHeaders();
    await fetch(`/api/tournaments/${tournamentId}/players/${playerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ teamId }),
    });
    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, teamId } : p)));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1">
              <Label>Team name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
              />
            </div>
          </div>
          <Button disabled={!name.trim() || submitting} onClick={add}>
            {submitting ? "Adding…" : "Add team"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams ({rows.length})</CardTitle>
          <CardDescription>
            Assign players to each team with the search box — click a player to add or remove
            them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground">No teams yet.</div>
          ) : (
            <div className="space-y-4">
              {rows.map((t) => (
                <TeamCard
                  key={t.id}
                  team={t}
                  players={players}
                  editing={editingId === t.id}
                  editName={editName}
                  editColor={editColor}
                  busy={busyId === t.id}
                  onStartEdit={() => {
                    setEditingId(t.id);
                    setEditName(t.name);
                    setEditColor(t.color ?? DEFAULT_COLOR);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onEditNameChange={setEditName}
                  onEditColorChange={setEditColor}
                  onSaveEdit={() => void saveEdit(t.id)}
                  onDelete={() => void remove(t.id)}
                  onAssign={(playerId) => void assignPlayer(playerId, t.id)}
                  onUnassign={(playerId) => void assignPlayer(playerId, null)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamCard({
  team,
  players,
  editing,
  editName,
  editColor,
  busy,
  onStartEdit,
  onCancelEdit,
  onEditNameChange,
  onEditColorChange,
  onSaveEdit,
  onDelete,
  onAssign,
  onUnassign,
}: {
  team: TeamRow;
  players: PlayerRow[];
  editing: boolean;
  editName: string;
  editColor: string;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (v: string) => void;
  onEditColorChange: (v: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onAssign: (playerId: string) => void;
  onUnassign: (playerId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const assigned = useMemo(
    () => players.filter((p) => p.teamId === team.id),
    [players, team.id]
  );

  // Only offer players who aren't on any team yet.
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => !p.teamId)
      .filter((p) => !q || p.displayName.toLowerCase().includes(q))
      .slice(0, 12);
  }, [players, search]);

  const bgColor = team.color ?? DEFAULT_COLOR;
  const textColor = readableTextColor(bgColor);
  const mutedColor = readableMutedTextColor(bgColor);
  const onWhiteText = textColor === "#ffffff";
  const chipClasses = onWhiteText
    ? "border-white/30 bg-white/15 hover:bg-white/30"
    : "border-black/25 bg-black/10 hover:bg-black/20";

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="color"
              value={editColor}
              onChange={(e) => onEditColorChange(e.target.value)}
              title="Team color"
              className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
            />
            <Input
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="max-w-xs bg-background text-foreground"
            />
            <Button size="sm" onClick={onSaveEdit} disabled={!editName.trim() || busy}>
              Save
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="font-semibold">{team.name}</span>
            <span className="text-xs" style={{ color: mutedColor }}>
              {assigned.length} player{assigned.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {!editing && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onStartEdit}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} disabled={busy}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Assigned players as removable chips */}
      {assigned.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((p) => (
            <button
              key={p.id}
              onClick={() => onUnassign(p.id)}
              title="Remove from team"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${chipClasses}`}
              style={{ color: textColor }}
            >
              {p.number != null && <span style={{ color: mutedColor }}>#{p.number}</span>}
              {p.displayName}
              <span style={{ color: mutedColor }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Search + multi-select dropdown */}
      <div className="relative max-w-sm" ref={boxRef}>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search players to add…"
          className="bg-background text-foreground"
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-64 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onAssign(p.id);
                  setSearch("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors"
              >
                <span>
                  {p.number != null && (
                    <span className="text-muted-foreground mr-1.5">#{p.number}</span>
                  )}
                  {p.displayName}
                </span>
              </button>
            ))}
          </div>
        )}
        {open && search.trim() && results.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
            No matching players.
          </div>
        )}
      </div>
    </div>
  );
}
