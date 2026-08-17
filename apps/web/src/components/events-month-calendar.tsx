"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SportEvent } from "@/types";
import { chicagoDateKey, chicagoWallToUtc, weekdayInChicago } from "@/lib/chicago-time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">{monthLabel}</h2>
        <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Times shown in America/Chicago.</p>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-muted px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const items = cell.dateKey ? byDay.get(cell.dateKey) ?? [] : [];
          const isToday = cell.dateKey === todayKey;
          return (
            <div
              key={cell.key}
              className={`min-h-[7.5rem] bg-background p-1.5 ${cell.day ? "" : "bg-muted/40"} ${
                isToday ? "ring-1 ring-inset ring-primary" : ""
              }`}
            >
              {cell.day ? (
                <>
                  <div className={`mb-1 text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {cell.day}
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.map((event) => {
                      const start = new Date(event.startTime as unknown as string);
                      const time = start.toLocaleTimeString("en-US", {
                        timeZone: "America/Chicago",
                        hour: "numeric",
                        minute: "2-digit",
                      });
                      const cancelled = event.status === "CANCELLED";
                      return (
                        <Link
                          key={event.id}
                          href={hrefForEvent(event)}
                          className={`block rounded px-1.5 py-1 text-[11px] leading-tight hover:opacity-90 ${
                            event.category === "FEATURED_EVENTS"
                              ? "bg-[color:var(--mz-coral)] text-white"
                              : "bg-[color:var(--mz-teal)] text-white"
                          } ${cancelled ? "opacity-50 line-through" : ""}`}
                        >
                          <span className="font-semibold">{time}</span> {event.title}
                        </Link>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
