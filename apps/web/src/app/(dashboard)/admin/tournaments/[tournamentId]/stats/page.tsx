"use client";

import { useEffect, useMemo, useState, use } from "react";
import {
  computeLeaderboardValue,
  playerHasLeaderboardActivity,
  sportFromStatTrackerId,
  trackerConfigAggregateFields,
  trackerConfigLeaderboardColumns,
  trackerConfigLeaderboardStats,
  trackerConfigWeights,
  tryGetSportContainerBySport,
  type TrackerConfig,
} from "@bsc/shared";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PlayerStatsRow = {
  id: string;
  displayName?: string | null;
  teamId?: string | null;
  [k: string]: unknown;
};
type TeamRow = { id: string; name: string };
type TeamStatsRow = {
  id: string;
  wins?: number;
  losses?: number;
  setsWon?: number;
  setsLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
};
type MatchRow = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: string;
  scoreA?: number;
  scoreB?: number;
};
type PlayRow = {
  id: string;
  seq: number;
  teamKey: "A" | "B";
  setNumber: number;
  entries: { playerId: string | null; statKey: string }[];
  pointTo: "A" | "B" | null;
  deleted: boolean;
  createdAt?: string | null;
};

// Static fallbacks while the global tracker config loads (volleyball container seed).
const volleyballSeed = tryGetSportContainerBySport("volleyball")?.defaultConfig();
const FALLBACK_AGG_BY_KEY: Record<string, string> = Object.fromEntries(
  (volleyballSeed?.stats ?? []).map((s) => [s.key, s.aggregateField])
);
const FALLBACK_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  (volleyballSeed?.stats ?? []).map((s) => [s.key, s.label])
);

export default function StatsPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [playerStats, setPlayerStats] = useState<PlayerStatsRow[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStatsRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<{ id: string; displayName: string }[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [sport, setSport] = useState<string>("volleyball");
  const [config, setConfig] = useState<TrackerConfig | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [savingWeights, setSavingWeights] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [playsLoading, setPlaysLoading] = useState(false);
  const [busyPlayId, setBusyPlayId] = useState<string | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setLoading(true);
    const headers = await authHeaders();
    const res = await fetch(`/api/tournaments/${tournamentId}/stats`, { headers });
    if (res.ok) {
      const data = await res.json();
      setPlayerStats(data.playerStats ?? []);
      setTeamStats(data.teamStats ?? []);
      setTeams(data.teams ?? []);
      setPlayers(data.players ?? []);
      setMatches(data.matches ?? []);

      // Leaderboard weights come from the global per-sport tracker config.
      const sportId = sportFromStatTrackerId(String(data.statTrackerId ?? "volleyball.v1"));
      setSport(sportId);
      const cfgRes = await fetch(`/api/tracker-config/${sportId}`, { headers });
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        const cfg = cfgData.config as TrackerConfig;
        setConfig(cfg);
        setWeights(trackerConfigWeights(cfg));
      } else {
        setWeights(data.statPointWeights ?? {});
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPlays = async (matchId: string) => {
    setPlaysLoading(true);
    const headers = await authHeaders();
    const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}/plays`, {
      headers,
    });
    const data = await res.json();
    setPlays(data.plays ?? []);
    setPlaysLoading(false);
  };

  useEffect(() => {
    if (selectedMatchId) void loadPlays(selectedMatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchId]);

  const teamName = (id?: string | null) => teams.find((t) => t.id === id)?.name ?? "—";
  const playerName = (id?: string | null) =>
    players.find((p) => p.id === id)?.displayName ??
    playerStats.find((p) => p.id === id)?.displayName ??
    "Player";

  const aggByKey = useMemo(
    () => (config ? trackerConfigAggregateFields(config) : FALLBACK_AGG_BY_KEY),
    [config]
  );
  const labelByKey = useMemo(
    () =>
      config
        ? Object.fromEntries(config.stats.map((s) => [s.key, s.label]))
        : FALLBACK_LABEL_BY_KEY,
    [config]
  );
  const counterColumns = useMemo(() => {
    const base = config
      ? trackerConfigLeaderboardColumns(config)
      : (volleyballSeed?.stats ?? []).map((s) => ({
          field: s.aggregateField,
          label: s.shortLabel,
        }));
    return [...base, { field: "pointsScored", label: "Pts" }];
  }, [config]);
  const editableStats = useMemo(
    () =>
      config
        ? trackerConfigLeaderboardStats(config).sort((a, b) => a.order - b.order)
        : [],
    [config]
  );

  const leaderboard = useMemo(
    () =>
      config
        ? playerStats
            .map((p) => ({
              ...p,
              points: computeLeaderboardValue(p as Record<string, unknown>, config),
            }))
            .filter((p) =>
              playerHasLeaderboardActivity(p as Record<string, unknown>, config)
            )
            .sort(
              (a, b) =>
                b.points - a.points ||
                (a.displayName ?? "").localeCompare(b.displayName ?? "")
            )
        : [],
    [playerStats, config]
  );

  const rebuildAggregates = async () => {
    if (
      !window.confirm(
        "Rebuild all player stat counters from play history? This fixes drift when stat keys changed."
      )
    ) {
      return;
    }
    setRebuilding(true);
    const headers = await authHeaders();
    const res = await fetch(`/api/tournaments/${tournamentId}/stats/rebuild`, {
      method: "POST",
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) window.alert(data?.error ?? "Rebuild failed");
    else window.alert(`Rebuilt stats for ${data.playersUpdated} players (${data.playsScanned} plays).`);
    await load();
    setRebuilding(false);
  };

  const saveWeights = async () => {
    setSavingWeights(true);
    const headers = await authHeaders();
    await fetch(`/api/tracker-config/${sport}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ points: weights }),
    });
    setSavingWeights(false);
  };

  const correctPlay = async (play: PlayRow) => {
    const action = play.deleted ? "undelete" : "delete";
    if (!window.confirm(`${action === "delete" ? "Delete" : "Restore"} play #${play.seq}?`)) return;
    setBusyPlayId(play.id);
    const headers = await authHeaders();
    const res = await fetch(
      `/api/tournaments/${tournamentId}/matches/${selectedMatchId}/plays/${play.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) window.alert(data?.error ?? "Correction failed");
    else if (data?.note) window.alert(data.note);
    await Promise.all([loadPlays(selectedMatchId), load()]);
    setBusyPlayId(null);
  };

  const exportCsv = () => {
    const header = ["Player", "Team", ...counterColumns.map((c) => c.field), "leaderboardPoints"];
    const lines = leaderboard.map((p) =>
      [
        JSON.stringify(p.displayName ?? "Player"),
        JSON.stringify(teamName(p.teamId as string)),
        ...counterColumns.map((c) => Number((p as PlayerStatsRow)[c.field] ?? 0)),
        p.points,
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tournament-${tournamentId}-stats.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading stats…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Standings */}
      <Card>
        <CardHeader>
          <CardTitle>Team standings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {teams.length === 0 ? (
            <div className="text-muted-foreground text-sm">No teams yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-3 font-medium">Team</th>
                  <th className="py-2 px-3 font-medium text-center">W</th>
                  <th className="py-2 px-3 font-medium text-center">L</th>
                  <th className="py-2 px-3 font-medium text-center">Sets</th>
                  <th className="py-2 px-3 font-medium text-center">Pts For</th>
                  <th className="py-2 px-3 font-medium text-center">Pts Against</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const s = teamStats.find((x) => x.id === t.id);
                  return (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{t.name}</td>
                      <td className="py-2 px-3 text-center tabular-nums">{s?.wins ?? 0}</td>
                      <td className="py-2 px-3 text-center tabular-nums">{s?.losses ?? 0}</td>
                      <td className="py-2 px-3 text-center tabular-nums">
                        {s?.setsWon ?? 0}–{s?.setsLost ?? 0}
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums">{s?.pointsFor ?? 0}</td>
                      <td className="py-2 px-3 text-center tabular-nums">
                        {s?.pointsAgainst ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard + export */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Player leaderboard</CardTitle>
            <CardDescription>Counters × point weights, computed live.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rebuildAggregates()}
              disabled={rebuilding}
            >
              {rebuilding ? "Rebuilding…" : "Rebuild from plays"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={leaderboard.length === 0}>
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {leaderboard.length === 0 ? (
            <div className="text-muted-foreground text-sm">No stats recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 px-2 font-medium">Player</th>
                  <th className="py-2 px-2 font-medium">Team</th>
                  {counterColumns.map((c) => (
                    <th key={c.field} className="py-2 px-2 font-medium text-center">
                      {c.label}
                    </th>
                  ))}
                  <th className="py-2 px-2 font-medium text-center">Value</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p, i) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">{p.displayName ?? "Player"}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {teamName(p.teamId as string)}
                    </td>
                    {counterColumns.map((c) => (
                      <td key={c.field} className="py-2 px-2 text-center tabular-nums">
                        {Number((p as PlayerStatsRow)[c.field] ?? 0)}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-center font-bold tabular-nums">{p.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Stat point weights (global per-sport config) */}
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard point weights</CardTitle>
          <CardDescription>
            Global weights for all {sport} tournaments; changes apply retroactively. Manage the
            full stat list in the Tracker console settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {editableStats.length === 0 ? (
            <div className="text-muted-foreground text-sm">Tracker config unavailable.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {editableStats.map((s) => (
                <div key={s.key} className="space-y-1">
                  <Label className="text-xs">{s.label}</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={weights[s.key] ?? s.points}
                    onChange={(e) =>
                      setWeights((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <Button onClick={saveWeights} disabled={savingWeights || editableStats.length === 0}>
            {savingWeights ? "Saving…" : "Save weights"}
          </Button>
        </CardContent>
      </Card>

      {/* Play log + box score */}
      <Card>
        <CardHeader>
          <CardTitle>Match play log</CardTitle>
          <CardDescription>
            Review every recorded play; delete or restore plays to correct mistakes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md">
            <Select value={selectedMatchId} onValueChange={setSelectedMatchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a match" />
              </SelectTrigger>
              <SelectContent>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {teamName(m.teamAId)} vs {teamName(m.teamBId)} ({m.status}
                    {m.status !== "UPCOMING" ? ` ${m.scoreA ?? 0}–${m.scoreB ?? 0}` : ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedMatchId ? null : playsLoading ? (
            <div className="text-muted-foreground text-sm">Loading plays…</div>
          ) : plays.length === 0 ? (
            <div className="text-muted-foreground text-sm">No plays recorded for this match.</div>
          ) : (
            <ul className="space-y-2">
              {plays.map((play) => (
                <li
                  key={play.id}
                  className={`flex flex-wrap items-center gap-2 border rounded-md px-3 py-2 ${
                    play.deleted ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-xs text-muted-foreground tabular-nums min-w-16">
                    #{play.seq} · S{play.setNumber} · {play.teamKey}
                  </span>
                  <span className="flex-1 text-sm">
                    {play.entries
                      .map((e) =>
                        e.playerId
                          ? `${playerName(e.playerId)} — ${labelByKey[e.statKey] ?? e.statKey}`
                          : labelByKey[e.statKey] ?? e.statKey
                      )
                      .join(" · ")}
                    {play.deleted && <span className="ml-2 text-xs text-destructive">(deleted)</span>}
                  </span>
                  {play.pointTo && (
                    <span className="text-xs font-semibold tabular-nums">+1 {play.pointTo}</span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyPlayId === play.id}
                    onClick={() => void correctPlay(play)}
                  >
                    {play.deleted ? "Restore" : "Delete"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
