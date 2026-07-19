"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_COLOR = "#1a3556";

type DivisionRow = { id: string; name: string; color?: string | null };
type TeamRow = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};

export default function DivisionsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user } = useAuth();
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [name, setName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string>>({});
  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [user]);

  const request = useCallback(
    async (url: string, init?: RequestInit) => {
      const headers = await authHeaders();
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [authHeaders]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [divisionData, teamData] = await Promise.all([
        request(`/api/tournaments/${tournamentId}/divisions`),
        request(`/api/tournaments/${tournamentId}/teams`),
      ]);
      setDivisions(divisionData.divisions ?? []);
      setTeams(teamData.teams ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load divisions");
    } finally {
      setLoading(false);
    }
  }, [request, tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  };

  const addDivision = async () => {
    setSubmitting(true);
    await run("new-division", async () => {
      await request(`/api/tournaments/${tournamentId}/divisions`, {
        method: "POST",
        body: JSON.stringify({ name, color: newColor }),
      });
      setName("");
      setNewColor(DEFAULT_COLOR);
      await load();
    });
    setSubmitting(false);
  };

  const patchDivision = async (
    divisionId: string,
    updates: Partial<Pick<DivisionRow, "name" | "color">>
  ) => {
    await request(`/api/tournaments/${tournamentId}/divisions/${divisionId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setDivisions((current) =>
      current.map((division) =>
        division.id === divisionId ? { ...division, ...updates } : division
      )
    );
  };

  const patchTeam = async (
    teamId: string,
    updates: Pick<TeamRow, "divisionId">
  ) => {
    await request(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setTeams((current) =>
      current.map((team) => (team.id === teamId ? { ...team, ...updates } : team))
    );
  };

  const deleteDivision = async (divisionId: string) => {
    if (
      !window.confirm(
        "Delete this division? Its teams will be kept and moved to Unassigned teams."
      )
    ) {
      return;
    }
    await run(divisionId, async () => {
      await request(`/api/tournaments/${tournamentId}/divisions/${divisionId}`, {
        method: "DELETE",
      });
      setDivisions((current) =>
        current.filter((division) => division.id !== divisionId)
      );
      setTeams((current) =>
        current.map((team) =>
          team.divisionId === divisionId ? { ...team, divisionId: null } : team
        )
      );
    });
  };

  const unassignedTeams = teams.filter((team) => !team.divisionId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add division</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1">
              <Label htmlFor="division-name">Division name</Label>
              <Input
                id="division-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Men's Open"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="division-color">Color</Label>
              <input
                id="division-color"
                type="color"
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
              />
            </div>
          </div>
          <Button disabled={!name.trim() || submitting} onClick={() => void addDivision()}>
            {submitting ? "Adding…" : "Add division"}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : divisions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">
            No divisions yet.
          </CardContent>
        </Card>
      ) : (
        divisions.map((division) => {
          const divisionTeams = teams.filter(
            (team) => team.divisionId === division.id
          );
          const editingDivision = editingDivisionId === division.id;
          return (
            <Card
              key={division.id}
              className="overflow-hidden"
              style={{ borderTopColor: division.color ?? DEFAULT_COLOR, borderTopWidth: 4 }}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {editingDivision ? (
                      <input
                        type="color"
                        value={editColor}
                        title="Division color"
                        onChange={(event) => setEditColor(event.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                      />
                    ) : (
                      <span
                        className="h-8 w-10 rounded border"
                        style={{ backgroundColor: division.color ?? DEFAULT_COLOR }}
                        title="Division color"
                      />
                    )}
                    {editingDivision ? (
                      <Input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        className="max-w-sm"
                        autoFocus
                      />
                    ) : (
                      <CardTitle>{division.name}</CardTitle>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {divisionTeams.length} team{divisionTeams.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingDivision ? (
                      <>
                        <Button
                          size="sm"
                          disabled={!editName.trim() || busyId === division.id}
                          onClick={() =>
                            void run(division.id, async () => {
                              await patchDivision(division.id, {
                                name: editName.trim(),
                                color: editColor,
                              });
                              setEditingDivisionId(null);
                            })
                          }
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingDivisionId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingDivisionId(division.id);
                            setEditName(division.name);
                            setEditColor(division.color ?? DEFAULT_COLOR);
                          }}
                        >
                          Edit division
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === division.id}
                          onClick={() => void deleteDivision(division.id)}
                        >
                          Delete division
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {unassignedTeams.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedTeams[division.id] ?? ""}
                      onChange={(event) =>
                        setSelectedTeams((current) => ({
                          ...current,
                          [division.id]: event.target.value,
                        }))
                      }
                      className="h-9 min-w-52 rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">Select an existing team…</option>
                      {unassignedTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedTeams[division.id]}
                      onClick={() => {
                        const teamId = selectedTeams[division.id];
                        if (!teamId) return;
                        void run(teamId, async () => {
                          await patchTeam(teamId, { divisionId: division.id });
                          setSelectedTeams((current) => ({
                            ...current,
                            [division.id]: "",
                          }));
                        });
                      }}
                    >
                      Assign team
                    </Button>
                  </div>
                )}

                {divisionTeams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No teams in this division.
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {divisionTeams.map((team) => (
                      <div
                        key={team.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor:
                                team.color ?? division.color ?? DEFAULT_COLOR,
                            }}
                          />
                          <span className="font-medium">{team.name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === team.id}
                          onClick={() =>
                            void run(team.id, () =>
                              patchTeam(team.id, { divisionId: null })
                            )
                          }
                        >
                          Remove from division
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {!loading && unassignedTeams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned teams ({unassignedTeams.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unassignedTeams.map((team) => (
              <span key={team.id} className="rounded-md border px-3 py-1.5 text-sm">
                {team.name}
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
