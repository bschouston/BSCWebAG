"use client";

import { readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

export type ScoreboardMatch = {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  currentSet?: number;
  setScores?: { a: number; b: number }[];
  courtNumber?: number;
};

export type ScoreboardTeam = {
  id: string;
  name: string;
  color?: string | null;
};

const DEFAULT_TEAM_COLOR = "#1a3556";

function TeamChip({ name, color }: { name: string; color?: string | null }) {
  const bg = color || DEFAULT_TEAM_COLOR;
  return (
    <div
      className="mx-auto max-w-full truncate rounded-lg px-3 py-2 text-base font-bold sm:text-lg md:text-xl"
      style={{ backgroundColor: bg, color: readableTextColor(bg) }}
      title={name}
    >
      {name}
    </div>
  );
}

export function PublicScoreboard({
  matches,
  teams,
  periodLabel,
  periodsWonLabel,
}: {
  matches: ScoreboardMatch[];
  teams: ScoreboardTeam[];
  periodLabel: string;
  periodsWonLabel: string;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-base text-muted-foreground text-center md:text-lg">
        No matches in progress right now.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-5">
      {matches.map((m) => {
        const set = m.currentSet ?? 1;
        const live = m.setScores?.[set - 1] ?? { a: 0, b: 0 };
        const teamA = teamById.get(m.teamAId);
        const teamB = teamById.get(m.teamBId);
        return (
          <div
            key={m.id}
            className={cn(
              "rounded-2xl border-2 border-red-500/30 bg-card p-6 md:p-8 shadow-sm",
              "ring-1 ring-red-500/20"
            )}
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground md:text-base">
              <span className="font-semibold">
                {periodLabel} {set}
                {m.courtNumber != null ? ` · Court ${m.courtNumber}` : ""}
              </span>
              <span className="inline-flex items-center gap-2 font-bold uppercase tracking-wide text-red-600">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
                </span>
                Live
              </span>
            </div>
            <div className="grid grid-cols-3 items-center gap-2 text-center">
              <div className="min-w-0 space-y-2">
                <TeamChip name={teamA?.name ?? "Team"} color={teamA?.color} />
                <div className="text-5xl font-black tabular-nums md:text-6xl">{live.a}</div>
                <div className="text-sm font-semibold text-muted-foreground md:text-base">
                  {periodsWonLabel} {m.scoreA ?? 0}
                </div>
              </div>
              <div className="text-muted-foreground text-lg font-extrabold tracking-widest md:text-xl">
                VS
              </div>
              <div className="min-w-0 space-y-2">
                <TeamChip name={teamB?.name ?? "Team"} color={teamB?.color} />
                <div className="text-5xl font-black tabular-nums md:text-6xl">{live.b}</div>
                <div className="text-sm font-semibold text-muted-foreground md:text-base">
                  {periodsWonLabel} {m.scoreB ?? 0}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
