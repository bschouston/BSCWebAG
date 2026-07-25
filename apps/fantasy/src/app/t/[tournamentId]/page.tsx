"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { computeFantasyTeamValue } from "@bsc/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { PlayerStatTable } from "@/components/player-stat-table";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebase/client";
import { useLiveTournamentStats } from "@/lib/use-live-tournament-stats";

export default function TournamentHubPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, loading } = useAuth();
  const { tournamentName, config, livePlayers, statsById, leaderboardColumns, pointsColor } =
    useLiveTournamentStats(tournamentId);
  const [team, setTeam] = useState<{
    teamName?: string;
    photoUrl?: string | null;
    playerIds?: string[];
    ownerDisplayName?: string;
  } | null>(null);
  const [teamName, setTeamName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [playerValues, setPlayerValues] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState(false);
  const [teamsLockedGlobal, setTeamsLockedGlobal] = useState(false);
  const [canEditAsAdmin, setCanEditAsAdmin] = useState(false);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = locked && !canEditAsAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    const run = async () => {
      setBusy(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      const nextTeam = data.team ?? null;
      setTeam(nextTeam);
      setTeamName(String(nextTeam?.teamName ?? ""));
      setPhotoUrl((nextTeam?.photoUrl as string | null) ?? null);
      setPlayerValues(
        data.config?.playerValues && typeof data.config.playerValues === "object"
          ? (data.config.playerValues as Record<string, number>)
          : {}
      );
      setLocked(data.effectivelyLocked === true);
      setTeamsLockedGlobal(data.teamsLockedGlobal === true);
      setCanEditAsAdmin(data.canEditAsAdmin === true);
      setBusy(false);
    };
    void run();
  }, [user, loading, tournamentId]);

  const roster = useMemo(() => {
    const ids = new Set(team?.playerIds ?? []);
    return livePlayers.filter((p) => ids.has(p.id));
  }, [livePlayers, team]);

  const totalValue = useMemo(() => {
    if (!config || !team?.playerIds) return 0;
    return computeFantasyTeamValue(team.playerIds, statsById, config);
  }, [config, team, statsById]);

  const onPhoto = async (file: File | null) => {
    if (!file || !user || readOnly) return;
    setError(null);
    try {
      const path = `fantasy/${tournamentId}/${user.uid}/logo-${Date.now()}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      setPhotoUrl(await getDownloadURL(r));
    } catch (e: any) {
      setError(e?.message ?? "Photo upload failed");
    }
  };

  const saveDetails = async () => {
    if (!user || readOnly || !team) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/team`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teamName,
          photoUrl,
          playerIds: team.playerIds ?? [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setTeam(data.team ?? { ...team, teamName, photoUrl });
      setLocked(data.effectivelyLocked === true);
      setTeamsLockedGlobal(data.teamsLockedGlobal === true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  const dirty =
    !!team &&
    (teamName.trim() !== String(team.teamName ?? "").trim() ||
      (photoUrl ?? null) !== (team.photoUrl ?? null));

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-6">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {tournamentName}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mt-1">
            My team
          </h1>
          {team?.ownerDisplayName ? (
            <p className="text-muted-foreground mt-1">Manager: {team.ownerDisplayName}</p>
          ) : null}
        </div>

        {busy ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !team ? (
          <Card>
            <CardHeader>
              <CardTitle>Create your team</CardTitle>
              <CardDescription>
                {locked
                  ? teamsLockedGlobal
                    ? "All fantasy rosters are locked. You can't set up a team until a Fantasy admin unlocks them."
                    : "Roster setup is locked. Ask a Fantasy admin to unlock it."
                  : "Pick a name and roster from this tournament's tracked players."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {locked && !canEditAsAdmin ? (
                <Button disabled className="font-bold">
                  Set up team
                </Button>
              ) : (
                <Button asChild className="font-bold">
                  <Link href={`/t/${tournamentId}/team`}>Set up team</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="bsc-accent-card overflow-hidden">
              <CardContent className="py-6 space-y-5">
                <div className="flex flex-wrap items-start gap-6">
                  <div className="space-y-2">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt=""
                        className="h-20 w-20 rounded-xl object-cover border"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-xl bg-primary/10 flex items-center justify-center text-2xl font-extrabold text-primary">
                        {(teamName || "?").slice(0, 1)}
                      </div>
                    )}
                    {!readOnly ? (
                      <div>
                        <Label className="text-xs">Change picture</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          className="mt-1 max-w-[220px] h-10 text-xs"
                          onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex-1 min-w-[220px] space-y-3">
                    <div className="space-y-1.5">
                      <Label>Team name</Label>
                      <Input
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={readOnly}
                        className="h-11 max-w-md"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        Live Fantasy Pts
                      </div>
                      <div className="text-4xl font-extrabold tabular-nums text-foreground">
                        {totalValue.toFixed(1)}
                      </div>
                      {locked ? (
                        <span className="inline-block mt-2 text-xs font-bold uppercase tracking-wide rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 px-2.5 py-1">
                          {teamsLockedGlobal ? "Locked (all teams)" : "Locked"}
                        </span>
                      ) : null}
                    </div>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    {!readOnly ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="font-bold"
                          disabled={saving || !dirty || !teamName.trim()}
                          onClick={() => void saveDetails()}
                        >
                          {saving ? "Saving…" : "Save name & picture"}
                        </Button>
                        <Button asChild variant="outline">
                          <Link href={`/t/${tournamentId}/team`}>Edit roster</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button disabled className="font-bold">
                          Edit roster
                        </Button>
                        <Button asChild variant="outline">
                          <Link href={`/t/${tournamentId}/team`}>View roster</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bsc-accent-card">
              <CardHeader>
                <CardTitle>Roster stats</CardTitle>
                <CardDescription>
                  Same stat breakdown as the public leaderboard, updating live during matches.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerStatTable
                  players={roster}
                  columns={leaderboardColumns}
                  pointsColor={pointsColor}
                  playerValues={playerValues}
                  emptyMessage="No players selected yet."
                />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </FantasyShell>
  );
}
