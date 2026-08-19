"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SportEvent } from "@/types";
import { chicagoDateKey, chicagoWallToUtc, weekdayInChicago } from "@/lib/chicago-time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

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

export function EventsMonthCalendar({
  events,
  hrefForEvent,
}: {
  events: SportEvent[];
  hrefForEvent: (event: SportEvent) => string;
}) {
  const todayKey = chicagoDateKey(new Date());
  const initial = chicagoYearMonth(new Date());
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  const byDay = useMemo(() => {
    const map = new Map<string, SportEvent[]>();
    for (const event of events) {
      const start = new Date(event.startTime as unknown as string);
      if (Number.isNaN(start.getTime())) continue;
      const key = chicagoDateKey(start);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.startTime as unknown as string).getTime() -
          new Date(b.startTime as unknown as string).getTime()
      );
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const dim = daysInMonth(year, month);
    const first = chicagoWallToUtc(`${year}-${pad(month)}-01T12:00:00`);
    const lead = weekdayInChicago(first);
    const total = Math.ceil((lead + dim) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const day = i - lead + 1;
      if (day < 1 || day > dim) return { key: `empty-${i}`, day: null as number | null, dateKey: "" };
      const dateKey = `${year}-${pad(month)}-${pad(day)}`;
      return { key: dateKey, day, dateKey };
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

  return (
    <div className="overflow-hidden rounded-2xl border border-[#ffd700]/35 bg-card shadow-lg shadow-[#1a3556]/10 ring-1 ring-inset ring-[#ffd700]/50">
      {/* Header */}
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

      {/* Weekday row */}
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

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-[#ffd700]/20">
        {cells.map((cell) => {
          const items = cell.dateKey ? byDay.get(cell.dateKey) ?? [] : [];
          const isToday = cell.dateKey === todayKey;
          const hasFeatured = items.some((e) => e.category === "FEATURED_EVENTS");
          const visible = items.slice(0, MAX_VISIBLE);
          const hiddenCount = items.length - visible.length;

          return (
            <div
              key={cell.key}
              className={[
                "min-h-[8.25rem] p-1.5 sm:p-2",
                cell.day ? "bg-background" : "bg-muted/50",
                isToday ? "bg-[#ffd700]/15 ring-2 ring-inset ring-[#ffd700]" : "",
                items.length > 0 && !isToday ? "bg-[#1ea7a0]/[0.06]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cell.day ? (
                <>
                  <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted-foreground">
                    <span className={isToday ? "text-[#1a3556] dark:text-[#ffd700]" : ""}>{cell.day}</span>
                    {items.length > 0 ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${hasFeatured ? "bg-[#e85d4c]" : "bg-[#1ea7a0]"}`}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    {visible.map((event) => {
                      const start = new Date(event.startTime as unknown as string);
                      const time = start.toLocaleTimeString("en-US", {
                        timeZone: "America/Chicago",
                        hour: "numeric",
                        minute: "2-digit",
                      });
                      return (
                        <Link
                          key={event.id}
                          href={hrefForEvent(event)}
                          className={`block rounded-md border border-white/20 px-1.5 py-1 text-[11px] leading-tight font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md ${chipClass(event)}`}
                        >
                          <span className="block text-[10px] font-extrabold tracking-wide opacity-95">
                            {time}
                          </span>
                          <span className="line-clamp-2">{event.title}</span>
                        </Link>
                      );
                    })}
                    {hiddenCount > 0 ? (
                      <span className="px-1 text-[10px] font-bold text-[#1a3556] dark:text-[#ffd700]">
                        +{hiddenCount} more
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#0d5c58] to-[#1ea7a0]" />
          Weekly sports
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#8a2e22] to-[#e85d4c]" />
          Featured events
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded ring-2 ring-[#ffd700] ring-inset" />
          Today
        </span>
      </div>
    </div>
  );
}
