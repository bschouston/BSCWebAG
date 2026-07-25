"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Info, Plus, User, X } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
} from "@bsc/ui";
import { FantasyShell } from "@/components/fantasy-shell";
import { FantasyValueMention } from "@/components/player-stat-table";
import { useAuth } from "@/lib/auth-context";
import { readableTextColor } from "@/lib/color-contrast";
import { skillHeatStyle, type PublicRosterSkill } from "@/lib/registration-profile";
import { useLiveTournamentStats, type LivePlayerRow } from "@/lib/use-live-tournament-stats";
import {
  computeFantasyRosterCost,
  playerFantasyValue,
} from "@bsc/shared";

const ALL_TEAMS = "__all__";

function TeamColorBadge({
  name,
  color,
  compact = false,
}: {
  name: string;
  color: string | null;
  compact?: boolean;
}) {
  if (!color) {
    return <span className="text-xs text-muted-foreground truncate">{name}</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md font-semibold",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      )}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

type PlayerProfile = {
  id: string;
  displayName: string;
  number: number | null;
  photoUrl: string | null;
  age: number | null;
  height: string | null;
  skills: PublicRosterSkill[];
};

function TeamChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
        active
          ? "bg-bsc-red text-bsc-red-foreground border-bsc-red"
          : "bg-card text-muted-foreground hover:border-bsc-red/40 hover:text-foreground"
      )}
    >
      {color ? (
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {label}
    </button>
  );
}

function PlayerDetailSheet({
  open,
  onOpenChange,
  player,
  fantasyValue,
  profile,
  loadingProfile,
  selected,
  readOnly,
  rosterFull,
  overBudget,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: LivePlayerRow | null;
  fantasyValue: number;
  profile: PlayerProfile | null;
  loadingProfile: boolean;
  selected: boolean;
  readOnly: boolean;
  rosterFull: boolean;
  overBudget: boolean;
  onToggle: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [profile?.photoUrl, player?.id]);

  if (!player) return null;

  const photo = profile?.photoUrl?.trim() || null;
  const showPhoto = !!photo && !imgFailed;
  const accent = player.teamColor || "#1a3556";
  const age = profile?.age ?? player.age;
  const height = profile?.height ?? player.height;
  const skills = profile?.skills?.length ? profile.skills : player.skills;
  const metaBits = [
    age != null ? `Age ${age}` : null,
    height ? height : null,
  ].filter(Boolean);
  const cantAdd = !selected && (rosterFull || overBudget);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {player.number != null ? `#${player.number} ` : ""}
            {player.displayName}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <TeamColorBadge name={player.teamName} color={player.teamColor} />
              <FantasyValueMention value={fantasyValue} />
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-4">
          <div className="flex items-center gap-4">
            <div
              className="relative size-24 shrink-0 overflow-hidden rounded-full border-2"
              style={{ borderColor: accent }}
            >
              {loadingProfile ? (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : showPhoto ? (
                <Image
                  src={photo}
                  alt={player.displayName}
                  fill
                  className="object-cover"
                  sizes="96px"
                  unoptimized
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ backgroundColor: `${accent}22`, color: accent }}
                >
                  <User className="size-8 opacity-70" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-lg truncate">{player.displayName}</div>
              <div className="mt-1">
                <TeamColorBadge name={player.teamName} color={player.teamColor} />
              </div>
              {metaBits.length ? (
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {metaBits.join(" · ")}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Skills
            </div>
            {loadingProfile && !skills.length ? (
              <p className="text-sm text-muted-foreground">Loading registration…</p>
            ) : skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => {
                  const heat = skillHeatStyle(s.rating);
                  return (
                    <span
                      key={s.key}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium dark:brightness-125"
                      style={heat}
                    >
                      <span className="opacity-80">{s.label}</span>
                      <span className="font-bold tabular-nums">{s.rating}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No registration skills on file.</p>
            )}
          </div>
        </div>

        <SheetFooter>
          {!readOnly ? (
            <Button
              className="w-full font-bold"
              variant={selected ? "outline" : "default"}
              disabled={cantAdd}
              onClick={() => {
                onToggle();
                onOpenChange(false);
              }}
            >
              {selected
                ? "Remove from roster"
                : rosterFull
                  ? "Roster full"
                  : overBudget
                    ? "Over budget"
                    : "Add to roster"}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RosterPlayerCard({
  slot,
  player,
  fantasyValue,
  profile,
  readOnly,
  onRemove,
}: {
  slot: number;
  player: LivePlayerRow;
  fantasyValue: number;
  profile: PlayerProfile | null;
  readOnly: boolean;
  onRemove: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photo = (profile?.photoUrl ?? player.photoUrl)?.trim() || null;
  const showPhoto = !!photo && !imgFailed;
  const accent = player.teamColor || "#1a3556";
  const age = profile?.age ?? player.age;
  const height = profile?.height ?? player.height;
  const skills = profile?.skills?.length ? profile.skills : player.skills;
  const metaBits = [
    age != null ? `Age ${age}` : null,
    height ? height : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2.5">
      <div className="flex gap-3">
        <div
          className="relative size-14 shrink-0 overflow-hidden rounded-full border-2"
          style={{ borderColor: accent }}
        >
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              <User className="size-5 opacity-70" />
            </div>
          )}
          {player.number != null ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums text-white shadow"
              style={{ backgroundColor: accent }}
            >
              {player.number}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <span className="text-[10px] font-bold tabular-nums text-muted-foreground mt-0.5">
              {slot}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm leading-tight truncate">
                {player.number != null ? (
                  <span className="text-muted-foreground font-semibold">#{player.number} </span>
                ) : null}
                {player.displayName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <FantasyValueMention value={fantasyValue} />
                <TeamColorBadge
                  name={player.teamName}
                  color={player.teamColor}
                  compact
                />
              </div>
              {metaBits.length ? (
                <div className="text-xs tabular-nums text-muted-foreground mt-0.5">
                  {metaBits.join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="text-right shrink-0">
              {!readOnly ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${player.displayName}`}
                  onClick={onRemove}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {skills.map((s) => {
            const heat = skillHeatStyle(s.rating);
            return (
              <span
                key={s.key}
                className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none dark:brightness-125"
                style={heat}
                title={`${s.label}: ${s.rating}/10`}
              >
                <span className="opacity-80">{s.label}</span>
                <span className="font-bold tabular-nums">{s.rating}</span>
              </span>
            );
          })}
        </div>
      ) : !profile ? (
        <p className="text-[10px] text-muted-foreground">Loading profile…</p>
      ) : null}
    </div>
  );
}

export default function EditTeamPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = use(params);
  const { user, profile, loading } = useAuth();
  const { tournamentName, livePlayers, teams } = useLiveTournamentStats(tournamentId);

  const [teamName, setTeamName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState(7);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [playerValues, setPlayerValues] = useState<Record<string, number>>({});
  const [eligiblePlayerIds, setEligiblePlayerIds] = useState<string[]>([]);
  const [eligibleTeamIds, setEligibleTeamIds] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [canEditAsAdmin, setCanEditAsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailProfile, setDetailProfile] = useState<PlayerProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rosterProfiles, setRosterProfiles] = useState<Record<string, PlayerProfile>>({});
  const rosterProfilesRef = useRef(rosterProfiles);
  rosterProfilesRef.current = rosterProfiles;

  const readOnly = locked && !canEditAsAdmin;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.assign("/login");
      return;
    }
    const run = async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/fantasy/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.team) {
        setTeamName(String(data.team.teamName ?? ""));
        setPhotoUrl((data.team.photoUrl as string | null) ?? null);
        setPlayerIds(Array.isArray(data.team.playerIds) ? data.team.playerIds : []);
      } else {
        const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
        setTeamName(name ? `${name}'s Team` : "My Fantasy Team");
        setPhotoUrl(null);
      }
      setTeamSize(Number(data.config?.teamSize ?? 7));
      const budget = data.config?.maxBudget;
      setMaxBudget(
        typeof budget === "number" && Number.isFinite(budget) && budget > 0
          ? budget
          : null
      );
      setPlayerValues(
        data.config?.playerValues && typeof data.config.playerValues === "object"
          ? (data.config.playerValues as Record<string, number>)
          : {}
      );
      setEligiblePlayerIds(data.config?.eligiblePlayerIds ?? []);
      setEligibleTeamIds(data.config?.eligibleTeamIds ?? []);
      setLocked(data.effectivelyLocked === true);
      setCanEditAsAdmin(data.canEditAsAdmin === true);
      setLoaded(true);
    };
    void run();
  }, [user, loading, tournamentId, profile]);

  // Load one player's registration profile only when the detail sheet opens.
  useEffect(() => {
    if (!detailId || !user) {
      setDetailProfile(null);
      return;
    }
    const cached = rosterProfilesRef.current[detailId];
    if (cached) {
      setDetailProfile(cached);
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailProfile(null);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/tournaments/${tournamentId}/fantasy/players/${detailId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.player) {
          setDetailProfile(data.player);
          setRosterProfiles((prev) => ({ ...prev, [detailId]: data.player }));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId, user, tournamentId]);

  // Fetch profiles only for players currently on the roster.
  useEffect(() => {
    if (!user || !playerIds.length) return;
    const missing = playerIds.filter((id) => !rosterProfilesRef.current[id]);
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const token = await user.getIdToken();
      const results = await Promise.all(
        missing.map(async (id) => {
          try {
            const res = await fetch(
              `/api/tournaments/${tournamentId}/fantasy/players/${id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json().catch(() => ({}));
            return res.ok && data.player
              ? ([id, data.player as PlayerProfile] as const)
              : null;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setRosterProfiles((prev) => {
        const next = { ...prev };
        for (const row of results) {
          if (row) next[row[0]] = row[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [playerIds, user, tournamentId]);

  const pool = useMemo(() => {
    return livePlayers.filter((p) => {
      if (eligiblePlayerIds.length > 0) return eligiblePlayerIds.includes(p.id);
      if (eligibleTeamIds.length > 0) return p.teamId && eligibleTeamIds.includes(p.teamId);
      return true;
    });
  }, [livePlayers, eligiblePlayerIds, eligibleTeamIds]);

  const filterTeams = useMemo(() => {
    const ids = new Set(pool.map((p) => p.teamId).filter(Boolean) as string[]);
    return teams
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pool, teams]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((p) => {
      if (teamFilter !== ALL_TEAMS && p.teamId !== teamFilter) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        (p.number != null && String(p.number).includes(q))
      );
    });
  }, [pool, teamFilter, query]);

  const selectedPlayers = useMemo(() => {
    const byId = new Map(livePlayers.map((p) => [p.id, p]));
    return playerIds.map((id) => byId.get(id)).filter(Boolean) as LivePlayerRow[];
  }, [playerIds, livePlayers]);

  const rosterCost = useMemo(
    () => computeFantasyRosterCost(playerIds, playerValues),
    [playerIds, playerValues]
  );
  const budgetRemaining =
    maxBudget != null ? maxBudget - rosterCost : null;
  const overBudget = maxBudget != null && rosterCost > maxBudget;

  const detailPlayer = detailId
    ? livePlayers.find((p) => p.id === detailId) ?? null
    : null;
  const detailFantasyValue = detailId
    ? playerFantasyValue(detailId, playerValues)
    : 0;
  const detailWouldExceed =
    !!detailId &&
    !playerIds.includes(detailId) &&
    maxBudget != null &&
    rosterCost + playerFantasyValue(detailId, playerValues) > maxBudget;

  const togglePlayer = (id: string) => {
    if (readOnly) return;
    setPlayerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= teamSize) return prev;
      if (
        maxBudget != null &&
        computeFantasyRosterCost(prev, playerValues) +
          playerFantasyValue(id, playerValues) >
          maxBudget
      ) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const save = async () => {
    if (!user || readOnly || overBudget) return;
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
        body: JSON.stringify({ teamName, photoUrl, playerIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      setLocked(data.effectivelyLocked === true);
      window.location.assign(`/t/${tournamentId}`);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !loaded) {
    return (
      <FantasyShell tournamentId={tournamentId}>
        <main className="p-8 text-muted-foreground">Loading…</main>
      </FantasyShell>
    );
  }

  return (
    <FantasyShell tournamentId={tournamentId}>
      <main className="w-full px-3 sm:px-4 lg:px-6 py-4 md:py-8 space-y-5">
        <div className="bsc-page-heading">
          <p className="text-sm font-semibold text-muted-foreground">{tournamentName}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {readOnly ? "Roster (locked)" : "Edit roster"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Filter by team, add players with +, and tap info for photo &amp; skills.
          </p>
          {locked ? (
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-2 font-medium">
              Roster edits are locked. A Fantasy admin can unlock your team.
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] xl:grid-cols-[minmax(400px,480px)_minmax(0,1fr)] lg:items-start">
          {/* Selected roster — left column on desktop */}
          <Card className="bsc-accent-card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle>
                Your roster ({playerIds.length}/{teamSize})
              </CardTitle>
              <CardDescription>
                Profiles appear when you add a player. Remove anyone with ×.
              </CardDescription>
              {maxBudget != null ? (
                <div
                  className={cn(
                    "mt-2 rounded-lg border px-3 py-2 text-sm tabular-nums",
                    overBudget
                      ? "border-destructive/50 bg-destructive/5 text-destructive"
                      : "bg-muted/40"
                  )}
                >
                  <div className="flex justify-between gap-2 font-semibold">
                    <span>Budget</span>
                    <span>
                      {rosterCost} / {maxBudget}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5 text-muted-foreground">
                    {overBudget
                      ? `Over by ${rosterCost - maxBudget}`
                      : `${budgetRemaining} remaining`}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  Roster Fantasy Value: {rosterCost}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: teamSize }, (_, i) => {
                  const p = selectedPlayers[i];
                  if (!p) {
                    return (
                      <div
                        key={`empty-${i}`}
                        className="rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground text-center"
                      >
                        Slot {i + 1}
                      </div>
                    );
                  }
                  return (
                    <RosterPlayerCard
                      key={p.id}
                      slot={i + 1}
                      player={p}
                      fantasyValue={playerFantasyValue(p.id, playerValues)}
                      profile={rosterProfiles[p.id] ?? null}
                      readOnly={readOnly}
                      onRemove={() => togglePlayer(p.id)}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Browser — right column */}
          <Card className="bsc-accent-card min-w-0">
            <CardHeader className="pb-3">
              <CardTitle>Find players</CardTitle>
              <CardDescription>
                {filterTeams.length
                  ? "Pick a real team to narrow the list, then add players."
                  : "Search and add players to your roster."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <TeamChip
                  label="All teams"
                  active={teamFilter === ALL_TEAMS}
                  onClick={() => setTeamFilter(ALL_TEAMS)}
                />
                {filterTeams.map((t) => (
                  <TeamChip
                    key={t.id}
                    label={t.name}
                    color={t.color}
                    active={teamFilter === t.id}
                    onClick={() => setTeamFilter(t.id)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or jersey #…"
                  className="max-w-sm h-10"
                  aria-label="Search players"
                />
                <p className="text-sm text-muted-foreground">
                  {visible.length} player{visible.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[min(36rem,65vh)] overflow-y-auto divide-y">
                  {visible.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No players match this filter.
                    </p>
                  ) : (
                    visible.map((p) => {
                      const selected = playerIds.includes(p.id);
                      const fv = playerFantasyValue(p.id, playerValues);
                      const wouldExceed =
                        !selected &&
                        maxBudget != null &&
                        rosterCost + fv > maxBudget;
                      const cantAdd =
                        !selected &&
                        (playerIds.length >= teamSize || wouldExceed);
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2.5",
                            selected && "bg-bsc-red/5"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate text-sm">
                              {p.number != null ? (
                                <span className="text-muted-foreground font-medium">
                                  #{p.number}{" "}
                                </span>
                              ) : null}
                              {p.displayName}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <FantasyValueMention value={fv} />
                              <TeamColorBadge
                                name={p.teamName}
                                color={p.teamColor}
                                compact
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 shrink-0"
                            aria-label={`Details for ${p.displayName}`}
                            onClick={() => setDetailId(p.id)}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                          {!readOnly ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={selected ? "outline" : "default"}
                              className="h-8 shrink-0 px-2.5"
                              disabled={cantAdd}
                              title={
                                wouldExceed
                                  ? "Adding this player would exceed the budget"
                                  : undefined
                              }
                              onClick={() => togglePlayer(p.id)}
                            >
                              {selected ? (
                                <>
                                  <X className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Remove</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Add</span>
                                </>
                              )}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {overBudget ? (
          <p className="text-sm text-destructive">
            Roster is over budget. Remove players before saving.
          </p>
        ) : null}

        {!readOnly ? (
          <Button
            className="font-bold h-11 px-6"
            onClick={() => void save()}
            disabled={saving || !teamName.trim() || overBudget}
          >
            {saving ? "Saving…" : "Save roster"}
          </Button>
        ) : null}
      </main>

      <PlayerDetailSheet
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        player={detailPlayer}
        fantasyValue={detailFantasyValue}
        profile={detailProfile}
        loadingProfile={detailLoading}
        selected={detailId ? playerIds.includes(detailId) : false}
        readOnly={readOnly}
        rosterFull={playerIds.length >= teamSize}
        overBudget={detailWouldExceed}
        onToggle={() => {
          if (detailId) togglePlayer(detailId);
        }}
      />
    </FantasyShell>
  );
}
