"use client";

import { FeaturedRegistrationActions } from "@/components/admin/featured-registration-actions";
import { WeeklyOccurrenceUpdateForm } from "@/components/admin/weekly-occurrence-update-form";
import { weeklyDetailsEditLocked, weeklyOccurrenceFinished, weeklyRsvpWindow, chicagoTimeLabel } from "@/lib/weekly-rsvp";
import { WeeklyOccurrenceActions, WeeklyRsvpWindowCard, WeeklyCancelEventButton } from "@/components/admin/weekly-occurrence-actions";
import { WeeklySeriesActions } from "@/components/admin/weekly-series-actions";
import { WeeklyEventLedger } from "@/components/admin/weekly-event-ledger";
import { WeeklyEventTeamsSection } from "@/components/admin/weekly-event-teams-section";
import { MemberSectionJumpNav } from "@/components/dashboard/member-section-jump-nav";
import { useAuth } from "@/lib/auth-context";
import { eventPagePath } from "@/lib/calendar-urls";
import { weeklySeriesCardTitle } from "@/lib/weekly-series-display";
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
  const [seriesMeta, setSeriesMeta] = useState<{ title: string; adminLabel: string | null } | null>(null);
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

  useEffect(() => {
    async function fetchSeries() {
      if (!user || !event?.seriesId) {
        setSeriesMeta(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/weekly-series/${event.seriesId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSeriesMeta({
            title: typeof data.title === "string" ? data.title : event.title,
            adminLabel:
              typeof data.adminLabel === "string" && data.adminLabel.trim()
                ? data.adminLabel.trim()
                : null,
          });
        }
      } catch (error) {
        console.error(error);
      }
    }
    void fetchSeries();
  }, [user, event?.seriesId, event?.title]);

  // Soft navigations can keep the previous scroll Y; always land at the top of Manage.
  useEffect(() => {
    if (loading) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [loading, id]);

  if (loading) return <div className="p-8">Loading event...</div>;
  if (!event) return <div className="p-8">Event not found</div>;

  const isWeekly = event.category === "WEEKLY_SPORTS";
  const weeklyDone = weeklyOccurrenceFinished(event);
  const editLocked = weeklyDone || weeklyDetailsEditLocked(event);
  const rsvpOpen = !weeklyDone && weeklyRsvpWindow(event) === "open";
  const viewHref = eventPagePath(event, { hash: null });
  const startLabel = event.startTime ? chicagoTimeLabel(event.startTime) : "";
  const templateTitle = seriesMeta?.title || event.title;
  const cardTitle = weeklySeriesCardTitle({
    title: templateTitle,
    adminLabel: seriesMeta?.adminLabel,
  });
  const showChangeWeek = isWeekly && !weeklyDone && weeklyDetailsEditLocked(event);
  const jumpItems = isWeekly
    ? weeklyDone
      ? [
          { id: "ledger", label: "Event ledger" },
          { id: "ledger-members", label: "Members" },
          { id: "ledger-activity", label: "Activity" },
        ]
      : [
          { id: "rsvp-window", label: "RSVPs" },
          ...(showChangeWeek ? [{ id: "change-week", label: "Change this week" }] : []),
          { id: "teams", label: "Teams" },
          { id: "attendance", label: "Attendance" },
        ]
    : [];

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

      {jumpItems.length > 0 ? <MemberSectionJumpNav items={jumpItems} /> : null}

      {isWeekly && event.seriesId && typeof event.seriesPaused === "boolean" ? (
        <div className="mb-6">
          <WeeklySeriesActions
            seriesId={event.seriesId}
            paused={event.seriesPaused === true}
            title={templateTitle}
            cardTitle={cardTitle}
            onChanged={() => {
              void (async () => {
                const token = await user?.getIdToken();
                const [eventRes, seriesRes] = await Promise.all([
                  fetch(`/api/events/${id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  }),
                  fetch(`/api/admin/weekly-series/${event.seriesId}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  }),
                ]);
                if (eventRes.status === 404) {
                  window.location.href = "/admin/events";
                  return;
                }
                const data = await eventRes.json();
                if (eventRes.ok) setEvent(data);
                const seriesData = await seriesRes.json().catch(() => ({}));
                if (seriesRes.ok) {
                  setSeriesMeta({
                    title: typeof seriesData.title === "string" ? seriesData.title : event.title,
                    adminLabel:
                      typeof seriesData.adminLabel === "string" && seriesData.adminLabel.trim()
                        ? seriesData.adminLabel.trim()
                        : null,
                  });
                }
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
          {showChangeWeek ? (
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
