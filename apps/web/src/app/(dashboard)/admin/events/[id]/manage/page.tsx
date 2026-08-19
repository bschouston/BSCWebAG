"use client";

import { FeaturedRegistrationActions } from "@/components/admin/featured-registration-actions";
import { WeeklyOccurrenceUpdateForm } from "@/components/admin/weekly-occurrence-update-form";
import { weeklyDetailsEditLocked, weeklyOccurrenceFinished, weeklyRsvpWindow, chicagoTimeLabel } from "@/lib/weekly-rsvp";
import { WeeklyOccurrenceActions, WeeklyRsvpWindowCard, WeeklyCancelEventButton } from "@/components/admin/weekly-occurrence-actions";
import { WeeklySeriesActions } from "@/components/admin/weekly-series-actions";
import { WeeklyEventLedger } from "@/components/admin/weekly-event-ledger";
import { WeeklyEventTeamsSection } from "@/components/admin/weekly-event-teams-section";
import { useAuth } from "@/lib/auth-context";
import { eventPagePath } from "@/lib/calendar-urls";
import { SportEvent } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export default function ManageEventPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [event, setEvent] = useState<SportEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      if (!id) return;
      try {
        const token = await user?.getIdToken();
        const res = await fetch(`/api/events/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok) setEvent(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    void fetchEvent();
  }, [id, user]);

  if (loading) return <div className="p-8">Loading event...</div>;
  if (!event) return <div className="p-8">Event not found</div>;

  const isWeekly = event.category === "WEEKLY_SPORTS";
  const weeklyDone = weeklyOccurrenceFinished(event);
  const editLocked = weeklyDone || weeklyDetailsEditLocked(event);
  const rsvpOpen = !weeklyDone && weeklyRsvpWindow(event) === "open";
  const viewHref = eventPagePath(event);
  const startLabel = event.startTime ? chicagoTimeLabel(event.startTime) : "";

  return (
    <div className="container p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/admin/events" className="underline-offset-4 hover:underline">
              Manage Events
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">{event.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={event.status === "PUBLISHED" ? "default" : "secondary"}>{event.status}</Badge>
            {rsvpOpen ? (
              <Badge className="border-transparent bg-[color:var(--mz-teal)] text-white">RSVP open</Badge>
            ) : weeklyDone ? null : editLocked ? (
              <Badge variant="outline">Use Manage for changes</Badge>
            ) : null}
            {isWeekly && event.seriesPaused === true ? (
              <Badge variant="secondary">Series paused</Badge>
            ) : null}
            <span className="text-sm text-muted-foreground">{startLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={viewHref} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              View event
            </Button>
          </Link>
          {editLocked ? (
            <Button
              variant="outline"
              disabled
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              title={
                weeklyDone
                  ? "This occurrence is completed or cancelled"
                  : "RSVP has opened — use this Manage page"
              }
            >
              Edit details
            </Button>
          ) : (
            <Link href={`/admin/events/${id}`}>
              <Button variant="outline">Edit details</Button>
            </Link>
          )}
          {isWeekly && !weeklyDone ? (
            <WeeklyCancelEventButton
              eventId={id}
              event={event}
              onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
            />
          ) : null}
        </div>
      </div>

      {isWeekly && event.seriesId && typeof event.seriesPaused === "boolean" ? (
        <div className="mb-6">
          <WeeklySeriesActions
            seriesId={event.seriesId}
            paused={event.seriesPaused === true}
            title={event.title}
            onChanged={() => {
              void (async () => {
                const token = await user?.getIdToken();
                const res = await fetch(`/api/events/${id}`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.status === 404) {
                  window.location.href = "/admin/events";
                  return;
                }
                const data = await res.json();
                if (res.ok) setEvent(data);
              })();
            }}
          />
        </div>
      ) : null}

      {isWeekly && weeklyDone ? (
        <WeeklyEventLedger eventId={id} />
      ) : isWeekly ? (
        <>
          <WeeklyRsvpWindowCard
            eventId={id}
            event={event}
            onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
          />
          {weeklyDetailsEditLocked(event) ? (
            <WeeklyOccurrenceUpdateForm
              eventId={id}
              event={event}
              onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
            />
          ) : (
            <p className="mb-6 text-sm text-muted-foreground">
              RSVP has not opened yet. Use Edit details to change date, title, tokens, and capacity.
            </p>
          )}
          <WeeklyEventTeamsSection
            eventId={id}
            event={event}
            onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
          />
          <WeeklyOccurrenceActions
            eventId={id}
            event={event}
            onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
          />
        </>
      ) : (
        <FeaturedRegistrationActions
          eventId={id}
          event={event}
          onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
        />
      )}
    </div>
  );
}
