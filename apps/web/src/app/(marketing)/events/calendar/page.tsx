"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { EventsMonthCalendar } from "@/components/events-month-calendar";
import { Button } from "@/components/ui/button";
import { CalendarSyncCard } from "@/components/calendar-sync-card";

export default function PublicEventsCalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/events");
        const data = await res.json();
        setEvents(data.events || []);
      } catch (error) {
        console.error("Failed to fetch events", error);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Events calendar</h1>
          <p className="mt-2 text-muted-foreground">Weekly sports and featured events (America/Chicago).</p>
        </div>
        <Link href="/events">
          <Button variant="outline">List view</Button>
        </Link>
      </div>
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading calendar…</div>
      ) : (
        <EventsMonthCalendar
          events={events}
          hrefForEvent={(event) => {
            if (event.slug) return `/events/${event.slug}`;
            if (user) return `/member/events/${event.id}`;
            return "/login";
          }}
        />
      )}
      <div className="mt-10">
        <CalendarSyncCard showPersonal={false} />
      </div>
    </div>
  );
}
