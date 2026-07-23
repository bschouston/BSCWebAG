"use client";

import { useEffect, useMemo, useState } from "react";
import { formatSetScores } from "@bsc/shared";
import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

export type ScheduleMatch = {
  id: string;
  teamAId: string;
  teamBId: string;
  status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  winnerTeamId?: string | null;
  scheduledAt?: { seconds?: number } | null;
  courtNumber?: number;
  pairingType?: "DIVISION" | "CROSS";
  divisionId?: string | null;
};

export type ScheduleTeam = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};

export type ScheduleDivision = {
  id: string;
  name: string;
  color?: string | null;
};

const DEFAULT_TEAM_COLOR = "#1a3556";
const ALL_SLOTS = "all";
const ALL_TEAMS = "all";

type ScheduleViewMode = "slots" | "teams";

function matchSeconds(m: ScheduleMatch): number | null {
  const s = m.scheduledAt?.seconds;
  return typeof s === "number" ? s : null;
}

/** Floor to the minute for slot grouping. */
function slotKey(seconds: number | null): string {
  if (seconds == null) return "unscheduled";
  return String(Math.floor(seconds / 60) * 60);
}

function formatSlotLabel(seconds: number | null): string {
  if (seconds == null) return "Unscheduled";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFilterLabel(seconds: number | null): string {
  if (seconds == null) return "Unscheduled";
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMatchTime(match: ScheduleMatch): string | null {
  const seconds = matchSeconds(match);
  if (seconds == null) return null;
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

type SlotGroup = {
  key: string;
  seconds: number | null;
  label: string;
  filterLabel: string;
  matches: ScheduleMatch[];
};

function groupMatchesBySlot(
  matches: ScheduleMatch[],
  teamName: (id: string) => string
): SlotGroup[] {
  const map = new Map<string, ScheduleMatch[]>();
  for (const m of matches) {
    const key = slotKey(matchSeconds(m));
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }

  const groups: SlotGroup[] = [];
  for (const [key, slotMatches] of map) {
    const seconds = key === "unscheduled" ? null : Number(key);
    const statusRank = (s: ScheduleMatch["status"]) =>
      s === "IN_PROGRESS" ? 0 : s === "UPCOMING" ? 1 : 2;
    const sorted = [...slotMatches].sort((a, b) => {
      const rank = statusRank(a.status) - statusRank(b.status);
      if (rank !== 0) return rank;
      const courtA = a.courtNumber ?? 999;
      const courtB = b.courtNumber ?? 999;
      if (courtA !== courtB) return courtA - courtB;
      return (
        teamName(a.teamAId).localeCompare(teamName(b.teamAId)) ||
        teamName(a.teamBId).localeCompare(teamName(b.teamBId))
      );
    });
    groups.push({
      key,
      seconds,
      label: formatSlotLabel(seconds),
      filterLabel: formatFilterLabel(seconds),
      matches: sorted,
    });
  }

  return groups.sort((a, b) => {
    if (a.seconds == null && b.seconds == null) return 0;
    if (a.seconds == null) return 1;
    if (b.seconds == null) return -1;
    return a.seconds - b.seconds;
  });
}

function DivisionRail({
  label,
  colorA,
  colorB,
  isCross,
}: {
  label: string | null;
  colorA?: string | null;
  colorB?: string | null;
  isCross: boolean;
}) {
  const railText = label ? (
    <span className="[writing-mode:vertical-rl] rotate-180 max-h-full truncate py-2 text-sm font-bold uppercase tracking-wider sm:text-base">
      {label}
    </span>
  ) : null;

  if (isCross && colorA && colorB && colorA !== colorB) {
    return (
      <div
        className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl sm:w-9"
        style={{
          background: `linear-gradient(180deg, ${colorA} 0%, ${colorA} 50%, ${colorB} 50%, ${colorB} 100%)`,
          color: readableTextColor(colorA),
        }}
      >
        {railText}
      </div>
    );
  }
  if (isCross && (!colorA || !colorB)) {
    return (
      <div className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl border-r border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground sm:w-9">
        {railText}
      </div>
    );
  }
  const color = colorA ?? colorB ?? "#94a3b8";
  return (
    <div
      className="flex w-8 shrink-0 items-center justify-center self-stretch rounded-l-xl sm:w-9"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {railText}
    </div>
  );
}

function TeamBlock({
  name,
  color,
  isWinner,
  isLoser,
}: {
  name: string;
  color?: string | null;
  isWinner?: boolean;
  isLoser?: boolean;
}) {
  const bg = color || DEFAULT_TEAM_COLOR;
  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 rounded-xl px-4 py-4 text-center sm:px-5 sm:py-5 transition-opacity",
        isWinner && "ring-2 ring-offset-2 ring-offset-background shadow-md",
        isLoser && "opacity-55"
      )}
      style={{
        backgroundColor: bg,
        color: readableTextColor(bg),
        // Use a brighter ring that still reads on colored backgrounds
        ...(isWinner ? { boxShadow: `0 0 0 3px ${bg}, 0 0 0 6px rgba(0,0,0,0.35)` } : null),
      }}
    >
      {isWinner ? (
        <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs">
          Winner
        </span>
      ) : null}
      <div className="text-xl font-extrabold leading-tight sm:text-2xl md:text-3xl truncate">
        {name}
      </div>
    </div>
  );
}

function SetScoreRow({
  setScores,
  highlightIndex,
}: {
  setScores?: { a: number; b: number }[] | null;
  highlightIndex?: number | null;
}) {
  if (!Array.isArray(setScores) || setScores.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {setScores.map((s, i) => {
        const active = highlightIndex != null && i === highlightIndex;
        return (
          <span
            key={i}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm font-bold tabular-nums sm:text-base",
              active
                ? "border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "border-border bg-muted/40 text-foreground"
            )}
            title={`Set ${i + 1}`}
          >
            {s?.a ?? 0}–{s?.b ?? 0}
          </span>
        );
      })}
    </div>
  );
}

function FightCard({
  match,
  teamName,
  teamColor,
  teamDivisionId,
  divisionById,
}: {
  match: ScheduleMatch;
  teamName: (id?: string | null) => string;
  teamColor: (id?: string | null) => string | null;
  teamDivisionId: (id?: string | null) => string | null;
  divisionById: Map<string, ScheduleDivision>;
}) {
  const isCross = match.pairingType === "CROSS";
  const isCompleted = match.status === "COMPLETED";
  const isLive = match.status === "IN_PROGRESS";
  const winnerId = match.winnerTeamId ?? null;
  const aWins = isCompleted && winnerId === match.teamAId;
  const bWins = isCompleted && winnerId === match.teamBId;

  const divAId = teamDivisionId(match.teamAId);
  const divBId = teamDivisionId(match.teamBId);
  const matchDivision = match.divisionId ? divisionById.get(match.divisionId) : null;

  let railColorA: string | null | undefined;
  let railColorB: string | null | undefined;
  if (isCross) {
    railColorA = divAId ? divisionById.get(divAId)?.color : null;
    railColorB = divBId ? divisionById.get(divBId)?.color : null;
  } else {
    railColorA = matchDivision?.color ?? (divAId ? divisionById.get(divAId)?.color : null);
  }

  const divisionLabel = isCross ? "Cross" : matchDivision?.name ?? null;
  const currentSetIdx =
    isLive && match.currentSet != null ? Math.max(0, match.currentSet - 1) : null;
  const setLine = formatSetScores(match.setScores);
  const timeLabel = formatMatchTime(match);
  const metaParts = [
    match.courtNumber != null ? `Court ${match.courtNumber}` : null,
    timeLabel,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "relative flex rounded-xl border bg-card",
        isLive && "ring-2 ring-red-500/40",
        isCompleted && aWins && "border-emerald-600/40",
        isCompleted && bWins && "border-emerald-600/40"
      )}
    >
      {metaParts.length > 0 && (
        <span className="absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-5 py-1 text-base font-bold text-background sm:text-lg">
          {metaParts.join(" · ")}
        </span>
      )}
      <DivisionRail
        label={divisionLabel}
        colorA={railColorA}
        colorB={railColorB}
        isCross={isCross}
      />
      <div className="min-w-0 flex-1 p-4 pt-7 sm:p-5 sm:pt-8 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
          <TeamBlock
            name={teamName(match.teamAId)}
            color={teamColor(match.teamAId)}
            isWinner={aWins}
            isLoser={isCompleted && !aWins && !!winnerId}
          />
          <div className="flex flex-col items-center justify-center shrink-0 gap-1 px-1">
            {(isLive || isCompleted) && (
              <div className="text-3xl font-black tabular-nums tracking-tight sm:text-4xl md:text-5xl">
                {match.scoreA ?? 0}
                <span className="mx-1 text-muted-foreground font-bold">–</span>
                {match.scoreB ?? 0}
              </div>
            )}
            <span className="text-sm font-extrabold tracking-widest text-muted-foreground sm:text-base">
              {isLive || isCompleted ? "SETS" : "VS"}
            </span>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 sm:text-base">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                Live
              </span>
            ) : null}
          </div>
          <TeamBlock
            name={teamName(match.teamBId)}
            color={teamColor(match.teamBId)}
            isWinner={bWins}
            isLoser={isCompleted && !bWins && !!winnerId}
          />
        </div>

        {(isLive || isCompleted) && (match.setScores?.length || setLine) ? (
          <div className="space-y-1.5">
            <div className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm">
              Set points
            </div>
            <SetScoreRow setScores={match.setScores} highlightIndex={currentSetIdx} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PublicSchedule({
  matches,
  teams,
  divisions,
}: {
  matches: ScheduleMatch[];
  teams: ScheduleTeam[];
  divisions: ScheduleDivision[];
}) {
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("slots");
  const [selectedSlot, setSelectedSlot] = useState<string>(ALL_SLOTS);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(ALL_TEAMS);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.name]));
    return (id?: string | null) => (id ? map.get(id) ?? "Team" : "Team");
  }, [teams]);

  const teamColor = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.color ?? null]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [teams]);

  const teamDivisionId = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t.divisionId ?? null]));
    return (id?: string | null) => (id ? map.get(id) ?? null : null);
  }, [teams]);

  const divisionById = useMemo(
    () => new Map(divisions.map((d) => [d.id, d])),
    [divisions]
  );

  const slots = useMemo(
    () => groupMatchesBySlot(matches, (id) => teamName(id)),
    [matches, teamName]
  );

  const teamsWithMatches = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matches) {
      if (m.teamAId) ids.add(m.teamAId);
      if (m.teamBId) ids.add(m.teamBId);
    }
    return [...teams]
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [matches, teams]);

  const matchesByTeam = useMemo(() => {
    const map = new Map<string, ScheduleMatch[]>();
    const statusRank = (s: ScheduleMatch["status"]) =>
      s === "IN_PROGRESS" ? 0 : s === "UPCOMING" ? 1 : 2;
    const sortTeamMatches = (list: ScheduleMatch[]) =>
      [...list].sort((a, b) => {
        const sa = matchSeconds(a);
        const sb = matchSeconds(b);
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        if (sa == null && sb != null) return 1;
        if (sa != null && sb == null) return -1;
        const rank = statusRank(a.status) - statusRank(b.status);
        if (rank !== 0) return rank;
        return (a.courtNumber ?? 999) - (b.courtNumber ?? 999);
      });

    for (const team of teamsWithMatches) {
      const list = matches.filter((m) => m.teamAId === team.id || m.teamBId === team.id);
      map.set(team.id, sortTeamMatches(list));
    }
    return map;
  }, [matches, teamsWithMatches]);

  useEffect(() => {
    if (selectedSlot === ALL_SLOTS) return;
    if (!slots.some((s) => s.key === selectedSlot)) {
      setSelectedSlot(ALL_SLOTS);
    }
  }, [slots, selectedSlot]);

  useEffect(() => {
    if (selectedTeamId === ALL_TEAMS) return;
    if (!teamsWithMatches.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(ALL_TEAMS);
    }
  }, [teamsWithMatches, selectedTeamId]);

  const visibleSlots = useMemo(() => {
    if (selectedSlot === ALL_SLOTS) return slots;
    return slots.filter((s) => s.key === selectedSlot);
  }, [slots, selectedSlot]);

  const visibleTeamSections = useMemo(() => {
    const list =
      selectedTeamId === ALL_TEAMS
        ? teamsWithMatches
        : teamsWithMatches.filter((t) => t.id === selectedTeamId);
    return list.map((team) => ({
      team,
      matches: matchesByTeam.get(team.id) ?? [],
    }));
  }, [teamsWithMatches, selectedTeamId, matchesByTeam]);

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-lg text-muted-foreground text-center">
        Schedule will appear here once matches are created.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="inline-flex rounded-full border bg-card p-1"
        role="group"
        aria-label="Schedule view"
      >
        <button
          type="button"
          onClick={() => setViewMode("slots")}
          className={cn(
            "rounded-full px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
            viewMode === "slots"
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          By time
        </button>
        <button
          type="button"
          onClick={() => setViewMode("teams")}
          className={cn(
            "rounded-full px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
            viewMode === "teams"
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          Per team
        </button>
      </div>

      {viewMode === "slots" ? (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter by time slot"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSlot === ALL_SLOTS}
              onClick={() => setSelectedSlot(ALL_SLOTS)}
              className={cn(
                "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                selectedSlot === ALL_SLOTS
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              )}
            >
              All
            </button>
            {slots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                role="tab"
                aria-selected={selectedSlot === slot.key}
                onClick={() => setSelectedSlot(slot.key)}
                className={cn(
                  "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                  selectedSlot === slot.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-muted/60"
                )}
              >
                {slot.filterLabel}
              </button>
            ))}
          </div>

          <div className="space-y-8">
            {visibleSlots.map((slot) => (
              <section key={slot.key} className="space-y-3">
                <header className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-sm bg-background/85">
                  <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {slot.label}
                  </h3>
                  <p className="text-base text-muted-foreground sm:text-lg">
                    {slot.matches.length} match{slot.matches.length === 1 ? "" : "es"}
                  </p>
                </header>
                <div className="grid gap-6 pt-2 lg:grid-cols-2">
                  {slot.matches.map((m) => (
                    <FightCard
                      key={m.id}
                      match={m}
                      teamName={teamName}
                      teamColor={teamColor}
                      teamDivisionId={teamDivisionId}
                      divisionById={divisionById}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter by team"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedTeamId === ALL_TEAMS}
              onClick={() => setSelectedTeamId(ALL_TEAMS)}
              className={cn(
                "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                selectedTeamId === ALL_TEAMS
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              )}
            >
              All teams
            </button>
            {teamsWithMatches.map((team) => {
              const color = team.color?.trim() || DEFAULT_TEAM_COLOR;
              const selected = selectedTeamId === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-base font-semibold transition-colors sm:text-lg",
                    selected
                      ? "border-transparent shadow-sm"
                      : "border-border bg-card text-foreground hover:bg-muted/60"
                  )}
                  style={
                    selected
                      ? {
                          backgroundColor: color,
                          color: readableTextColor(color),
                          borderColor: color,
                        }
                      : undefined
                  }
                >
                  {team.name}
                </button>
              );
            })}
          </div>

          <div className="space-y-10">
            {visibleTeamSections.map(({ team, matches: teamMatches }) => {
              const color = team.color?.trim() || DEFAULT_TEAM_COLOR;
              return (
                <section key={team.id} className="space-y-4">
                  <header className="sticky top-0 z-10 -mx-1 px-1 py-2 backdrop-blur-sm bg-background/85">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="inline-flex max-w-full items-center rounded-xl px-4 py-2 text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl"
                        style={{
                          backgroundColor: color,
                          color: readableTextColor(color),
                        }}
                      >
                        <span className="truncate">{team.name}</span>
                      </span>
                      <p className="text-base text-muted-foreground sm:text-lg">
                        {teamMatches.length} match{teamMatches.length === 1 ? "" : "es"}
                      </p>
                    </div>
                  </header>
                  <div className="grid gap-6 pt-1 lg:grid-cols-2">
                    {teamMatches.map((m) => (
                      <FightCard
                        key={`${team.id}-${m.id}`}
                        match={m}
                        teamName={teamName}
                        teamColor={teamColor}
                        teamDivisionId={teamDivisionId}
                        divisionById={divisionById}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
