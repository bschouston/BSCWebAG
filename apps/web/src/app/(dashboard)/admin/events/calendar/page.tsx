"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { EventsMonthCalendar } from "@/components/events-month-calendar";
import { Button } from "@/components/ui/button";
import { weeklyDetailsEditLocked } from "@/lib/weekly-rsvp";

export default function AdminEventsCalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await user?.getIdToken();
        const res = await fetch("/api/events", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setEvents(data.events || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    if (user) void load();
  }, [user]);

  return (
    <div className="container p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Events calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click an occurrence to manage that week. Edit details is locked once RSVP opens.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/events">
            <Button variant="outline">Table view</Button>
          </Link>
          <Link href="/admin/events/new">
            <Button>Create Event</Button>
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading calendar…</div>
      ) : (
        <EventsMonthCalendar
          events={events}
          hrefForEvent={(event) =>
            weeklyDetailsEditLocked(event) ? `/admin/events/${event.id}/manage` : `/admin/events/${event.id}`
          }
        />
      )}
    </div>
  );
}
