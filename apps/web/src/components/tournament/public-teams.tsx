"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import { readableTextColor } from "@/lib/color-contrast";
import {
  ageFromDob,
  hasCachedPublicProfile,
  parseCachedSkills,
} from "@/lib/registration-public-profile";

const FALLBACK_COLOR = "#1a3556";

/** In-flight enrich calls so remounts don't re-hit the slow path. */
const enrichStarted = new Set<string>();

export type PublicTeamsTeam = {
  id: string;
  name: string;
  color?: string | null;
  divisionId?: string | null;
};

export type PublicTeamsDivision = {
  id: string;
  name: string;
};

export type PublicTeamsSkill = {
  key: string;
  label: string;
  rating: number;
};

export type PublicTeamsPlayer = {
  id: string;
  displayName: string;
  number?: number | null;
  photoUrl?: string | null;
  age?: number | null;
  height?: string | null;
  skills?: PublicTeamsSkill[];
};

/** Raw player doc from Firestore (public collection). */
export type PublicTeamsPlayerDoc = {
  id: string;
  displayName?: string | null;
  teamId?: string | null;
  number?: number | null;
  photoUrl?: string | null;
  height?: string | null;
  dateOfBirth?: string | null;
  skills?: unknown;
};

function playerDocToRosterPlayer(doc: PublicTeamsPlayerDoc): PublicTeamsPlayer {
  const dob =
    typeof doc.dateOfBirth === "string" && doc.dateOfBirth.trim()
      ? doc.dateOfBirth.trim()
      : null;
  const number =
    typeof doc.number === "number"
      ? doc.number
      : doc.number != null && String(doc.number).trim() !== "" && !Number.isNaN(Number(doc.number))
        ? Number(doc.number)
        : null;
  return {
    id: doc.id,
    displayName: String(doc.displayName ?? "Player").trim() || "Player",
    number,
    photoUrl: typeof doc.photoUrl === "string" ? doc.photoUrl : null,
    age: ageFromDob(dob),
    height: typeof doc.height === "string" && doc.height.trim() ? doc.height.trim() : null,
    skills: parseCachedSkills(doc.skills),
  };
}

function sortRosterPlayers(a: PublicTeamsPlayer, b: PublicTeamsPlayer): number {
  const an = a.number ?? Number.POSITIVE_INFINITY;
  const bn = b.number ?? Number.POSITIVE_INFINITY;
  return (
    an - bn ||
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );
}

/** Heat-map colors for skill ratings (1 = worst, 10 = best). */
function skillHeatStyle(rating: number): { backgroundColor: string; borderColor: string; color: string } {
  const t = Math.max(1, Math.min(10, Math.round(rating)));
  // Red (1) → amber (5–6) → green (10)
  const stops: [number, number, number][] = [
    [220, 38, 38], // 1 red-600
    [234, 88, 12], // 2 orange-600
    [249, 115, 22], // 3 orange-500
    [245, 158, 11], // 4 amber-500
    [234, 179, 8], // 5 yellow-500
    [202, 138, 4], // 6 yellow-600
    [132, 204, 22], // 7 lime-500
    [34, 197, 94], // 8 green-500
    [22, 163, 74], // 9 green-600
    [21, 128, 61], // 10 green-700
  ];
  const [r, g, b] = stops[t - 1];
  return {
    backgroundColor: `rgba(${r},${g},${b},0.16)`,
    borderColor: `rgba(${r},${g},${b},0.45)`,
    color: `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`,
  };
}

function PlayerRow({
  player,
  accent,
}: {
  player: PublicTeamsPlayer;
  accent: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const photo = player.photoUrl?.trim() || null;
  const showPhoto = !!photo && !imgFailed;
  const initials = player.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const skills = player.skills ?? [];
  const metaBits = [
    player.age != null ? `Age ${player.age}` : null,
    player.height ? player.height : null,
  ].filter(Boolean);

  return (
    <div className="flex gap-3 rounded-xl border bg-background/70 p-3 sm:gap-4 sm:p-3.5 dark:border-slate-700/80">
      <div
        className="relative size-16 shrink-0 overflow-hidden rounded-full border-2 shadow-md sm:size-20"
        style={{
          borderColor: accent,
          boxShadow: `0 0 0 3px ${accent}33, 0 8px 18px rgba(0,0,0,0.16)`,
        }}
      >
        {showPhoto ? (
          <Image
            src={photo}
            alt={player.displayName}
            fill
            className="object-cover"
            sizes="80px"
            unoptimized
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-sm font-bold"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            {initials || <User className="size-6 opacity-70" aria-hidden />}
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

      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-bold leading-tight sm:text-base">{player.displayName}</div>
        {metaBits.length > 0 ? (
          <div className="mt-1 text-xs text-muted-foreground tabular-nums sm:text-sm">
            {metaBits.join(" · ")}
          </div>
        ) : null}
        {skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((s) => {
              const heat = skillHeatStyle(s.rating);
              return (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none dark:brightness-125 sm:text-[11px]"
                  style={heat}
                  title={`${s.label}: ${s.rating}/10`}
                >
                  <span className="opacity-80">{s.label}</span>
                  <span className="font-bold tabular-nums">{s.rating}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  players,
  index,
}: {
  team: PublicTeamsTeam;
  players: PublicTeamsPlayer[];
  index: number;
}) {
  const bg = team.color?.trim() || FALLBACK_COLOR;
  const fg = readableTextColor(bg);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.35), duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border bg-card shadow-sm dark:border-slate-600"
    >
      <header
        className="relative isolate overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{ backgroundColor: bg, color: fg }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 90% at 100% 0%, rgba(255,255,255,0.22), transparent 55%),
              radial-gradient(ellipse 50% 70% at 0% 100%, rgba(0,0,0,0.18), transparent 50%)
            `,
          }}
        />
        <h3 className="relative text-balance text-2xl font-black leading-tight tracking-tight sm:text-3xl">
          {team.name}
        </h3>
      </header>

      <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
        {players.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No players assigned yet.</p>
        ) : (
          players.map((player) => (
            <PlayerRow key={player.id} player={player} accent={bg} />
          ))
        )}
      </div>
    </motion.article>
  );
}

export function PublicTeams({
  tournamentId,
  teams,
  divisions,
  playerDocs,
}: {
  tournamentId: string;
  teams: PublicTeamsTeam[];
  divisions: PublicTeamsDivision[];
  /** Live Firestore player docs from the parent subscription. */
  playerDocs: PublicTeamsPlayerDoc[] | null;
}) {
  const enrichAttempted = useRef(false);

  // Warm player-doc cache in the background once; live snapshot picks up writes.
  useEffect(() => {
    if (!playerDocs || playerDocs.length === 0) return;
    const assigned = playerDocs.filter((p) => !!p.teamId);
    if (!assigned.length) return;
    const incomplete = assigned.some((p) => !hasCachedPublicProfile(p as Record<string, unknown>));
    if (!incomplete) return;
    if (enrichStarted.has(tournamentId) || enrichAttempted.current) return;
    enrichStarted.add(tournamentId);
    enrichAttempted.current = true;
    void fetch(`/api/tournaments/${tournamentId}/public-rosters`).catch(() => {
      enrichStarted.delete(tournamentId);
    });
  }, [playerDocs, tournamentId]);

  const rostersByTeam = useMemo(() => {
    const map: Record<string, PublicTeamsPlayer[]> = {};
    for (const doc of playerDocs ?? []) {
      const teamId = typeof doc.teamId === "string" && doc.teamId.trim() ? doc.teamId.trim() : null;
      if (!teamId) continue;
      const list = map[teamId] ?? [];
      list.push(playerDocToRosterPlayer(doc));
      map[teamId] = list;
    }
    for (const teamId of Object.keys(map)) {
      map[teamId].sort(sortRosterPlayers);
    }
    return map;
  }, [playerDocs]);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [teams]
  );

  const divisionSections = useMemo(() => {
    if (divisions.length <= 1) {
      return [{ key: "all", title: null as string | null, teams: sortedTeams }];
    }
    const byDiv = new Map<string | null, PublicTeamsTeam[]>();
    for (const team of sortedTeams) {
      const key = team.divisionId ?? null;
      const list = byDiv.get(key) ?? [];
      list.push(team);
      byDiv.set(key, list);
    }
    const named = [...divisions]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((d) => ({
        key: d.id,
        title: d.name,
        teams: byDiv.get(d.id) ?? [],
      }))
      .filter((s) => s.teams.length > 0);
    const unassigned = byDiv.get(null) ?? [];
    if (unassigned.length) {
      named.push({ key: "unassigned", title: "Unassigned", teams: unassigned });
    }
    return named;
  }, [divisions, sortedTeams]);

  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-base text-muted-foreground md:text-lg">
        Teams will appear once they are added to the tournament.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {playerDocs === null ? (
        <p className="text-sm text-muted-foreground">Loading team rosters…</p>
      ) : null}
      {divisionSections.map((section) => (
        <section key={section.key} className="space-y-4">
          {section.title ? (
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.title}
            </h2>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
            {section.teams.map((team, i) => (
              <TeamCard
                key={team.id}
                team={team}
                players={rostersByTeam[team.id] ?? []}
                index={i}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
