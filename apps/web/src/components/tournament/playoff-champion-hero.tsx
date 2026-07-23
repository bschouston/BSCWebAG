"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Crown, User } from "lucide-react";
import { readableMutedTextColor, readableTextColor } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "#1a3556";

export type ChampionPlayer = {
  id: string;
  displayName: string;
  number?: number | null;
  photoUrl?: string | null;
};

function PlayerAvatar({
  player,
  delay,
}: {
  player: ChampionPlayer;
  delay: number;
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

  return (
    <motion.figure
      className="flex w-[6.5rem] flex-col items-center gap-2 sm:w-[7rem] lg:w-auto lg:min-w-[5.75rem] lg:max-w-[8.5rem] lg:flex-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div
        className="relative size-20 overflow-hidden rounded-full border-2 border-amber-300/90 shadow-md sm:size-24"
        style={{
          boxShadow: "0 0 0 3px rgba(251,191,36,0.25), 0 8px 20px rgba(0,0,0,0.25)",
        }}
      >
        {showPhoto ? (
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
          <div className="flex h-full w-full items-center justify-center bg-amber-950/40 text-amber-50">
            {initials ? (
              <span className="text-base font-bold tracking-wide sm:text-lg">{initials}</span>
            ) : (
              <User className="size-8 opacity-80" aria-hidden />
            )}
          </div>
        )}
      </div>
      <figcaption className="w-full text-center text-xs font-semibold leading-snug sm:text-sm line-clamp-2">
        {player.displayName}
      </figcaption>
    </motion.figure>
  );
}

/** Celebratory champion banner for the public playoffs tab. */
export function PlayoffChampionHero({
  name,
  color,
  players,
  className,
}: {
  name: string;
  color?: string | null;
  players?: ChampionPlayer[];
  className?: string;
}) {
  const bg = color?.trim() || FALLBACK_COLOR;
  const fg = readableTextColor(bg);
  const muted = readableMutedTextColor(bg);
  const isLightText = fg === "#ffffff";
  const roster = players ?? [];

  return (
    <motion.div
      role="status"
      aria-label={`Tournament champion: ${name}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border shadow-lg",
        className
      )}
      style={{
        borderColor: isLightText ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.12)",
        backgroundColor: bg,
        color: fg,
      }}
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 70% at 50% -10%, rgba(251,191,36,0.45), transparent 55%),
            radial-gradient(ellipse 55% 50% at 15% 110%, rgba(255,255,255,0.18), transparent 50%),
            radial-gradient(ellipse 50% 45% at 90% 100%, rgba(0,0,0,0.22), transparent 55%)
          `,
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 top-1/2 size-[28rem] -translate-y-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(251,191,36,0.28)" }}
        animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.06, 1] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-1/4 top-0 size-[22rem] rounded-full blur-3xl"
        style={{ backgroundColor: isLightText ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)" }}
        animate={{ opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />

      {/* Soft sheen sweep */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-18deg]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
        }}
        initial={{ left: "-40%", opacity: 0 }}
        animate={{ left: ["-40%", "120%"], opacity: [0, 0.7, 0] }}
        transition={{ duration: 3.8, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }}
      />

      {/* Edge rails */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.85), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.55), transparent)",
        }}
      />

      <div className="relative flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-12 md:py-14">
        <motion.div
          className="mb-5 flex size-16 items-center justify-center rounded-full border sm:mb-6 sm:size-20"
          style={{
            borderColor: "rgba(251,191,36,0.65)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(254,243,199,0.95), rgba(245,158,11,0.9) 45%, rgba(180,83,9,0.95))",
            boxShadow:
              "0 0 0 6px rgba(251,191,36,0.18), 0 12px 40px rgba(0,0,0,0.28)",
          }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Crown className="size-8 text-amber-950 sm:size-10" strokeWidth={1.75} aria-hidden />
        </motion.div>

        <motion.p
          className="mb-2 text-[11px] font-bold uppercase tracking-[0.28em] sm:text-xs"
          style={{ color: muted }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          Tournament Champion
        </motion.p>

        <motion.h2
          className="max-w-3xl text-balance text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl"
          style={{
            textShadow: isLightText
              ? "0 2px 24px rgba(0,0,0,0.35)"
              : "0 2px 18px rgba(255,255,255,0.25)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.45 }}
        >
          {name}
        </motion.h2>

        <motion.div
          className="mt-5 h-1 w-24 rounded-full sm:mt-6 sm:w-28"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(251,191,36,0.95), transparent)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />

        {roster.length > 0 ? (
          <motion.div
            className="mt-6 flex w-full max-w-5xl flex-wrap items-start justify-center gap-3 sm:mt-7 sm:gap-4 lg:max-w-6xl lg:flex-nowrap lg:gap-5 px-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.35 }}
          >
            {roster.map((player, i) => (
              <PlayerAvatar key={player.id} player={player} delay={0.42 + i * 0.05} />
            ))}
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Loads champion roster (with photos) for the public playoffs hero. */
export function useChampionRoster(
  tournamentId: string,
  teamId: string | null | undefined
): ChampionPlayer[] {
  const [players, setPlayers] = useState<ChampionPlayer[]>([]);

  useEffect(() => {
    if (!teamId) {
      setPlayers([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/tournaments/${tournamentId}/teams/${teamId}/public-roster`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPlayers([]);
          return;
        }
        setPlayers(Array.isArray(data.players) ? data.players : []);
      } catch {
        if (!cancelled) setPlayers([]);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, teamId]);

  return players;
}
