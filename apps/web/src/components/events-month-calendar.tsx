"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SportEvent } from "@/types";
import { chicagoDateKey, chicagoWallToUtc, weekdayInChicago } from "@/lib/chicago-time";
import { sportEmoji, type CatalogItem } from "@/lib/sports-catalog";
import { useSportsCatalog } from "@/hooks/use-sports-catalog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;
const MOBILE_UPCOMING_COUNT = 5;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function chicagoYearMonth(date: Date) {
  const [year, month] = chicagoDateKey(date).split("-").map(Number);
  return { year, month };
}

function chipClass(event: SportEvent) {
  const featured = event.category === "FEATURED_EVENTS";
  const base = featured
    ? "bg-gradient-to-br from-[#8a2e22] via-[#e85d4c] to-[#f08070] shadow-[#e85d4c]/30"
    : "bg-gradient-to-br from-[#0d5c58] via-[#1ea7a0] to-[#5ec9c4] shadow-[#1ea7a0]/30";
  const state =
    event.status === "CANCELLED"
      ? " opacity-55 line-through grayscale-[35%]"
      : event.status === "DRAFT"
        ? " border-dashed"
        : "";
  return `${base}${state}`;
}

function eventStart(event: SportEvent): Date {
  return new Date(event.startTime as unknown as string);
}

function formatChipTime(start: Date) {
  return start.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatChipDate(start: Date) {
  return start.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function chipSportEmoji(
  event: SportEvent,
  sportsBySlug: Map<string, CatalogItem>
): string | null {
  if (event.category !== "WEEKLY_SPORTS") return null;
  const sportId = typeof event.sportId === "string" ? event.sportId : "";
  if (!sportId) return null;
  const catalog = sportsBySlug.get(sportId);
  return sportEmoji({ slug: sportId, emoji: catalog?.emoji });
}

function CalendarEventChip({
  event,
  href,
  sportsBySlug,
  timeLabel,
  compact,
  className,
}: {
  event: SportEvent;
  href: string;
  sportsBySlug: Map<string, CatalogItem>;
  timeLabel: string;
  compact?: boolean;
  className?: string;
}) {
  const emoji = chipSportEmoji(event, sportsBySlug);
  return (
    <Link
      href={href}
      className={`flex items-stretch gap-1 rounded-md border border-white/20 font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md ${chipClass(event)} ${className ?? ""}`}
    >
      <span className={`min-w-0 flex-1 ${compact ? "px-1.5 py-1 text-[11px] leading-tight" : "pl-3 pr-1 py-2.5 text-sm leading-snug"}`}>
        <span
          className={`block font-extrabold tracking-wide opacity-95 ${compact ? "text-[10px]" : "text-xs"}`}
        >
          {timeLabel}
        </span>
        <span className={`mt-0.5 block ${compact ? "line-clamp-2" : ""}`}>{event.title}</span>
      </span>
      {emoji ? (
        <span
          className={`flex shrink-0 items-center justify-center self-stretch ${
            compact ? "pr-1 pl-0.5 text-xl leading-none" : "pr-2.5 pl-0.5 text-3xl leading-none"
          }`}
          aria-hidden
        >
          {emoji}
        </span>
      ) : null}
    </Link>
  );
}

export function EventsMonthCalendar({
  events,
  hrefForEvent,
}: {
  events: SportEvent[];
  hrefForEvent: (event: SportEvent) => string;
}) {
  const { sports } = useSportsCatalog();
  const sportsBySlug = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const sport of sports) map.set(sport.slug, sport);
    return map;
  }, [sports]);

  const todayKey = chicagoDateKey(new Date());
  const initial = chicagoYearMonth(new Date());
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  const byDay = useMemo(() => {
    const map = new Map<string, SportEvent[]>();
    for (const event of events) {
      const start = eventStart(event);
      if (Number.isNaN(start.getTime())) continue;
      const key = chicagoDateKey(start);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
    }
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => {
        if (event.status === "CANCELLED" || event.status === "COMPLETED") return false;
        const start = eventStart(event);
        return !Number.isNaN(start.getTime()) && start.getTime() >= now;
      })
      .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())
      .slice(0, MOBILE_UPCOMING_COUNT);
  }, [events]);

  const cells = useMemo(() => {
    const dim = daysInMonth(year, month);
    const first = chicagoWallToUtc(`${year}-${pad(month)}-01T12:00:00`);
    const lead = weekdayInChicago(first);
    const total = Math.ceil((lead + dim) / 7) * 7;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevDim = daysInMonth(prevYear, prevMonth);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return Array.from({ length: total }, (_, i) => {
      const day = i - lead + 1;
      if (day < 1) {
        const prevDay = prevDim + day;
        const dateKey = `${prevYear}-${pad(prevMonth)}-${pad(prevDay)}`;
        return { key: dateKey, day: prevDay, dateKey, outsideMonth: true };
      }
      if (day > dim) {
        const nextDay = day - dim;
        const dateKey = `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}`;
        return { key: dateKey, day: nextDay, dateKey, outsideMonth: true };
      }
      const dateKey = `${year}-${pad(month)}-${pad(day)}`;
      return { key: dateKey, day, dateKey, outsideMonth: false };
    });
  }, [year, month]);

  const monthLabel = chicagoWallToUtc(`${year}-${pad(month)}-01T12:00:00`).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  };

  function Legend({ showToday }: { showToday?: boolean }) {
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#0d5c58] to-[#1ea7a0]" />
          Weekly sports
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#8a2e22] to-[#e85d4c]" />
          Featured events
        </span>
        {showToday ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded ring-2 ring-[#ffd700] ring-inset" />
            Today
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffd700]/35 bg-card shadow-lg shadow-[#1a3556]/10 ring-1 ring-inset ring-[#ffd700]/50">
      {/* Mobile: chip list of next upcoming */}
      <div className="md:hidden">
        <div className="bg-gradient-to-br from-[#122540] via-[#1a3556] to-[#1f4a78] px-4 py-4 text-white">
          <h2 className="text-xl font-bold tracking-tight">Upcoming</h2>
          <p className="mt-0.5 text-xs text-white/75">Next {MOBILE_UPCOMING_COUNT} · America/Chicago</p>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No upcoming events.</p>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {upcoming.map((event) => {
              const start = eventStart(event);
              return (
                <CalendarEventChip
                  key={event.id}
                  event={event}
                  href={hrefForEvent(event)}
                  sportsBySlug={sportsBySlug}
                  timeLabel={`${formatChipDate(start)} · ${formatChipTime(start)}`}
                  className="rounded-lg"
                />
              );
            })}
          </div>
        )}
        <Legend />
      </div>

      {/* Desktop / tablet: month grid */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-[#122540] via-[#1a3556] to-[#1f4a78] px-4 py-4 text-white">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 border-[#ffd700]/45 bg-white/10 text-white hover:bg-[#ffd700]/20 hover:text-white"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 text-center">
            <h2 className="text-xl font-bold tracking-tight">{monthLabel}</h2>
            <p className="mt-0.5 text-xs text-white/75">America/Chicago</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 border-[#ffd700]/45 bg-white/10 text-white hover:bg-[#ffd700]/20 hover:text-white"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-[#ffd700]/25">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-[#ffd700]/15 px-1 py-2 text-center text-[0.68rem] font-extrabold uppercase tracking-widest text-[#1a3556] dark:text-white/90"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-[#ffd700]/20">
          {cells.map((cell) => {
            const items = byDay.get(cell.dateKey) ?? [];
            const isToday = cell.dateKey === todayKey;
            const hasFeatured = items.some((e) => e.category === "FEATURED_EVENTS");
            const visible = items.slice(0, MAX_VISIBLE);
            const hiddenCount = items.length - visible.length;

            return (
              <div
                key={cell.key}
                className={[
                  "min-h-[8.25rem] p-1.5 sm:p-2",
                  cell.outsideMonth ? "bg-muted/50" : "bg-background",
                  isToday ? "bg-[#ffd700]/15 ring-2 ring-inset ring-[#ffd700]" : "",
                  items.length > 0 && !isToday && !cell.outsideMonth ? "bg-[#1ea7a0]/[0.06]" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span
                    className={
                      isToday
                        ? "text-[#1a3556] dark:text-[#ffd700]"
                        : cell.outsideMonth
                          ? "text-muted-foreground/60"
                          : ""
                    }
                  >
                    {cell.day}
                  </span>
                  {items.length > 0 ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${hasFeatured ? "bg-[#e85d4c]" : "bg-[#1ea7a0]"}`}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  {visible.map((event) => {
                    const start = eventStart(event);
                    return (
                      <CalendarEventChip
                        key={event.id}
                        event={event}
                        href={hrefForEvent(event)}
                        sportsBySlug={sportsBySlug}
                        timeLabel={formatChipTime(start)}
                        compact
                        className={cell.outsideMonth ? "opacity-80" : ""}
                      />
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <span className="px-1 text-[10px] font-bold text-[#1a3556] dark:text-[#ffd700]">
                      +{hiddenCount} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <Legend showToday />
      </div>
    </div>
  );
}
