"use client";

import Link from "next/link";
import { CalendarCheck, Flame, MapPin, Medal, Trophy } from "lucide-react";
import { useSportsCatalog } from "@/hooks/use-sports-catalog";
import { chicagoTimeLabel } from "@/lib/weekly-rsvp";

export type MemberRsvpHistory = {
  id: string;
  eventId: string | null;
  status: string;
  waitlistPosition: number | null;
  tokensHeld: number | null;
  tokensFinal: number | null;
  attended: boolean;
  noShow: boolean;
  event: {
    title: string;
    startTime: string | null;
    endTime: string | null;
    sportId: string | null;
    locationId: string | null;
    category: string | null;
    status: string | null;
  } | null;
};

export type HistoryOutcome = "played" | "no_show" | "waitlisted" | "cancelled";

function eventTime(row: MemberRsvpHistory) {
  const raw = row.event?.endTime || row.event?.startTime;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function isPastRsvp(row: MemberRsvpHistory, now = new Date()) {
  const eventStatus = row.event?.status;
  if (eventStatus === "COMPLETED" || eventStatus === "CANCELLED") return true;
  if (row.event?.category === "WEEKLY_SPORTS") return false;
  const t = eventTime(row);
  if (!t) return row.status === "CANCELLED";
  return t.getTime() < now.getTime();
}

export function historyOutcome(row: MemberRsvpHistory): HistoryOutcome {
  if (row.noShow) return "no_show";
  if (row.status === "CANCELLED" || row.event?.status === "CANCELLED") return "cancelled";
  if (row.status === "WAITLISTED") return "waitlisted";
  if (row.attended || row.status === "CONFIRMED") return "played";
  return "cancelled";
}

function formatWhen(iso: string | null) {
  return chicagoTimeLabel(iso === null ? undefined : iso).replace(/^—$/, "Date TBD");
}

function titleCaseSport(slug: string) {
  return slug
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const chipClass: Record<HistoryOutcome, string> = {
  played: "mz-chip mz-chip-played",
  no_show: "mz-chip mz-chip-noshow",
  waitlisted: "mz-chip mz-chip-wait",
  cancelled: "mz-chip mz-chip-cancel",
};

const chipLabel: Record<HistoryOutcome, string> = {
  played: "Attended",
  no_show: "No-show",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
};

export function AttendanceHistory({ rsvps }: { rsvps: MemberRsvpHistory[] }) {
  const { sports } = useSportsCatalog();
  const past = rsvps
    .filter((row) => isPastRsvp(row))
    .sort((a, b) => {
      const at = eventTime(a)?.getTime() ?? 0;
      const bt = eventTime(b)?.getTime() ?? 0;
      return bt - at;
    });

  const attended = past.filter((row) => historyOutcome(row) === "played");
  const rsvpCount = rsvps.filter((row) => {
    if (row.noShow) return true;
    return row.status === "CONFIRMED" || row.status === "WAITLISTED";
  }).length;

  let streak = 0;
  for (const row of past) {
    const outcome = historyOutcome(row);
    if (outcome === "played") streak += 1;
    else if (outcome === "waitlisted" || outcome === "cancelled") continue;
    else break;
  }

  const sportCounts = new Map<string, { count: number; lastAt: number }>();
  for (const row of attended) {
    const sportId = row.event?.sportId?.trim();
    if (!sportId) continue;
    const prev = sportCounts.get(sportId) ?? { count: 0, lastAt: 0 };
    sportCounts.set(sportId, {
      count: prev.count + 1,
      lastAt: Math.max(prev.lastAt, eventTime(row)?.getTime() ?? 0),
    });
  }
  const favoriteSlug = [...sportCounts.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].lastAt - a[1].lastAt;
  })[0]?.[0];
  const favoriteLabel = favoriteSlug
    ? sports.find((s) => s.slug === favoriteSlug || s.id === favoriteSlug)?.label ||
      titleCaseSport(favoriteSlug)
    : "—";

  return (
    <section className="mz-history mb-10">
      <p className="mz-kicker relative z-10">Attendance history</p>
      <h2 className="relative z-10 mt-2 text-3xl font-extrabold tracking-tight text-[#1a3556] dark:text-white md:text-4xl">
        Your run of play
      </h2>

      <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="mz-history-stat">
          <Trophy className="mb-2 h-5 w-5 text-[#8a6d00] dark:text-[color:var(--mz-gold)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6d00] dark:text-white/70">
            Events attended
          </p>
          <p className="mz-history-num mt-1">{attended.length}</p>
        </div>
        <div className="mz-history-stat">
          <Flame className="mb-2 h-5 w-5 text-[color:var(--mz-coral)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6d00] dark:text-white/70">
            Hot streak
          </p>
          <p className="mz-history-num mt-1">{streak}</p>
        </div>
        <div className="mz-history-stat">
          <CalendarCheck className="mb-2 h-5 w-5 text-[#8a6d00] dark:text-[color:var(--mz-gold)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6d00] dark:text-white/70">
            RSVPs
          </p>
          <p className="mz-history-num mt-1">{rsvpCount}</p>
        </div>
        <div className="mz-history-stat">
          <Medal className="mb-2 h-5 w-5 text-[color:var(--mz-teal)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6d00] dark:text-white/70">
            Favorite sport
          </p>
          <p className="mz-history-sport mt-1">{favoriteLabel}</p>
        </div>
      </div>

      <div className="relative z-10 mt-6 space-y-2">
        {past.length === 0 ? (
          <p className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/15 dark:bg-white/5 dark:text-white/80">
            No games on the board yet. RSVP this week and start your streak.
          </p>
        ) : (
          past.slice(0, 12).map((row) => {
            const outcome = historyOutcome(row);
            const href = row.eventId ? `/member/events/${row.eventId}` : "/member/events";
            return (
              <Link key={row.id} href={href} className="mz-history-row">
                <span className={chipClass[outcome]}>{chipLabel[outcome]}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#1a3556] dark:text-white">
                    {row.event?.title || "Club event"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground dark:text-white/70">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {formatWhen(row.event?.startTime ?? null)}
                    {row.event?.locationId ? ` · ${row.event.locationId}` : ""}
                    {row.event?.sportId ? ` · ${row.event.sportId}` : ""}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
