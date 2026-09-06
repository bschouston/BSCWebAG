"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SportEvent } from "@/types";
import { weeklyDetailsEditLocked, weeklyOccurrenceFinished, weeklyRsvpWindow } from "@/lib/weekly-rsvp";
import { WeeklySeriesActions } from "@/components/admin/weekly-series-actions";
import { SportFilterChips } from "@/components/sport-filter-chips";
import { useSportsCatalog } from "@/hooks/use-sports-catalog";
import { usePersistedSportFilter } from "@/hooks/use-persisted-sport-filter";
import { sortSportFilterIds } from "@/lib/sport-filter-storage";
import { cn } from "@/lib/utils";
import { Edit, Plus, Settings2, Trash2 } from "lucide-react";

const ADMIN_SPORT_FILTER_KEY = "bsc.admin-events.sports";

type SeriesMeta = { id: string; title: string; paused: boolean; sportId?: string };

function eventDateLabel(event: SportEvent) {
  return new Date(event.startTime as unknown as string).toLocaleDateString();
}

function EventWeekActions({
  event,
  onDeleteWeek,
  className,
  manageFullWidth = false,
}: {
  event: SportEvent;
  onDeleteWeek: (id: string) => void;
  className?: string;
  manageFullWidth?: boolean;
}) {
  const editLocked = weeklyOccurrenceFinished(event) || weeklyDetailsEditLocked(event);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", manageFullWidth && "w-full", className)}>
      <Link
        href={`/admin/events/${event.id}/manage`}
        className={manageFullWidth ? "min-w-0 flex-1" : undefined}
      >
        <Button variant="outline" size="sm" className={manageFullWidth ? "w-full" : undefined}>
          <Settings2 className="mr-1 h-4 w-4" />
          Manage
        </Button>
      </Link>
      {editLocked ? (
        <Button
          variant="ghost"
          size="icon"
          disabled
          className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
          title={
            weeklyOccurrenceFinished(event)
              ? "This occurrence is completed or cancelled"
              : weeklyRsvpWindow(event) === "open"
                ? "RSVP is open — use Manage"
                : "RSVP has opened — use Manage"
          }
        >
          <Edit className="h-4 w-4" />
        </Button>
      ) : (
        <Link href={`/admin/events/${event.id}`}>
          <Button variant="ghost" size="icon" title="Edit details">
            <Edit className="h-4 w-4" />
          </Button>
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        onClick={() => onDeleteWeek(event.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EventStatusCell({ event }: { event: SportEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={event.status === "PUBLISHED" ? "default" : "secondary"}>{event.status}</Badge>
      {weeklyRsvpWindow(event) === "open" ? (
        <Badge className="border-transparent bg-[color:var(--mz-teal)] text-white">RSVP open</Badge>
      ) : null}
    </div>
  );
}

function EventOccurrenceCard({
  event,
  onDeleteWeek,
  showCategory = false,
}: {
  event: SportEvent;
  onDeleteWeek: (id: string) => void;
  showCategory?: boolean;
}) {
  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{eventDateLabel(event)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{event.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showCategory ? (
          <Badge variant="outline">{event.category.replace("_", " ")}</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">Capacity {event.capacity}</span>
        <EventStatusCell event={event} />
      </div>
      <EventWeekActions event={event} onDeleteWeek={onDeleteWeek} manageFullWidth />
    </li>
  );
}

function EventTableRow({
  event,
  onDeleteWeek,
}: {
  event: SportEvent;
  onDeleteWeek: (id: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{event.title}</TableCell>
      <TableCell className="text-foreground">{eventDateLabel(event)}</TableCell>
      <TableCell>
        <Badge variant="outline">{event.category.replace("_", " ")}</Badge>
      </TableCell>
      <TableCell className="text-foreground">{event.capacity}</TableCell>
      <TableCell>
        <EventStatusCell event={event} />
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <EventWeekActions event={event} onDeleteWeek={onDeleteWeek} className="justify-end" />
      </TableCell>
    </TableRow>
  );
}

export default function AdminEventsPage() {
  const { user } = useAuth();
  const { sports } = useSportsCatalog();
  const { selectedSports, sportFilterReady, toggleSportFilter, clearSportFilter } =
    usePersistedSportFilter(ADMIN_SPORT_FILTER_KEY);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const token = await user?.getIdToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const [eventsRes, seriesRes] = await Promise.all([
        fetch("/api/events?limit=100", { headers }),
        fetch("/api/admin/weekly-series", { headers }),
      ]);
      const eventsData = await eventsRes.json();
      const seriesData = await seriesRes.json().catch(() => ({}));
      setEvents(eventsData.events || []);
      setSeriesList(Array.isArray(seriesData.series) ? seriesData.series : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleDeleteWeek = async (id: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/events/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setEvents(events.filter((e) => e.id !== id));
      } else {
        alert("Failed to delete event");
      }
    } catch (error) {
      console.error(error);
      alert("Error deleting event");
    }
  };

  if (loading) return <div className="p-4 md:p-8">Loading events...</div>;

  const featuredAll = events.filter((e) => e.category !== "WEEKLY_SPORTS");
  const weeklyEvents = events.filter((e) => e.category === "WEEKLY_SPORTS");
  const weeksBySeries = new Map<string, SportEvent[]>();
  for (const event of weeklyEvents) {
    const key = event.seriesId || `_one:${event.id}`;
    const list = weeksBySeries.get(key) ?? [];
    list.push(event);
    weeksBySeries.set(key, list);
  }

  const seriesBlocksAll: {
    id: string;
    title: string;
    paused: boolean;
    sportId: string;
    weeks: SportEvent[];
    canManageSeries: boolean;
  }[] = [];
  const seen = new Set<string>();
  for (const meta of seriesList) {
    seen.add(meta.id);
    const weeks = weeksBySeries.get(meta.id) ?? [];
    seriesBlocksAll.push({
      id: meta.id,
      title: meta.title,
      paused: meta.paused,
      sportId: meta.sportId || weeks[0]?.sportId || "",
      weeks,
      canManageSeries: true,
    });
  }
  for (const [key, weeks] of weeksBySeries) {
    if (key.startsWith("_one:") || seen.has(key)) continue;
    seriesBlocksAll.push({
      id: key,
      title: weeks[0]?.title || "Weekly series",
      paused: weeks[0]?.seriesPaused === true,
      sportId: weeks[0]?.sportId || "",
      weeks,
      canManageSeries: false,
    });
  }
  for (const [key, weeks] of weeksBySeries) {
    if (!key.startsWith("_one:")) continue;
    seriesBlocksAll.push({
      id: key,
      title: weeks[0]?.title || "Weekly sport",
      paused: false,
      sportId: weeks[0]?.sportId || "",
      weeks,
      canManageSeries: false,
    });
  }

  const sportFilterActive = sportFilterReady && selectedSports.length > 0;
  const allowed = new Set(selectedSports);
  const matchesSport = (sportId: string | undefined | null) => Boolean(sportId && allowed.has(sportId));
  const seriesBlocks = sportFilterActive
    ? seriesBlocksAll.filter(
        (block) => matchesSport(block.sportId) || block.weeks.some((week) => matchesSport(week.sportId))
      )
    : seriesBlocksAll;
  const featured = sportFilterActive ? featuredAll.filter((e) => matchesSport(e.sportId)) : featuredAll;
  const sportOptions = sortSportFilterIds(
    [
      ...new Set(
        [
          ...events.map((e) => e.sportId),
          ...seriesList.map((s) => s.sportId || ""),
        ].filter((id): id is string => Boolean(id))
      ),
    ],
    sports
  );

  const tableHead = (
    <TableHeader>
      <TableRow>
        <TableHead>Title</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Capacity</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  const featuredEmptyMessage =
    featured.length === 0 && events.length === 0 && seriesBlocksAll.length === 0
      ? "No events found."
      : featured.length === 0
        ? sportFilterActive
          ? "No featured events match your sport filter."
          : "No featured events."
        : null;

  return (
    <div className="container p-4 md:p-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-foreground">Manage Events</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/events/calendar">
            <Button variant="outline">Calendar</Button>
          </Link>
          <Link href="/admin/events/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Event
            </Button>
          </Link>
        </div>
      </div>

      <SportFilterChips
        sportIds={sportOptions}
        selectedSports={selectedSports}
        sports={sports}
        onToggle={toggleSportFilter}
        onClear={clearSportFilter}
      />

      {seriesBlocksAll.length > 0 ? (
        <div className="mb-10 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Weekly series</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each card is one series. Pause, duplicate, and delete on a card apply only to that series, not the whole
              page.
            </p>
          </div>
          {sportFilterActive && seriesBlocksAll.length > 0 && seriesBlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No weekly series match your sport filter.{" "}
              <button type="button" className="underline underline-offset-4" onClick={clearSportFilter}>
                Show all sports
              </button>
            </p>
          ) : null}
          {seriesBlocks.map((block) => (
            <Card key={block.id}>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8a6d00] dark:text-[#ffd700]">
                    Series
                  </p>
                  <CardTitle className="mt-1 text-xl text-foreground">{block.title}</CardTitle>
                  {block.paused ? (
                    <Badge variant="secondary" className="mt-2">
                      Paused
                    </Badge>
                  ) : null}
                </div>
                {block.canManageSeries ? (
                  <WeeklySeriesActions
                    seriesId={block.id}
                    paused={block.paused}
                    title={block.title}
                    onChanged={() => void fetchAll()}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {block.weeks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No weeks on the calendar yet.</p>
                ) : (
                  <>
                    <ul className="space-y-3 md:hidden">
                      {block.weeks.map((event) => (
                        <EventOccurrenceCard
                          key={event.id}
                          event={event}
                          onDeleteWeek={handleDeleteWeek}
                        />
                      ))}
                    </ul>
                    <div className="hidden overflow-x-auto rounded-md border md:block">
                      <Table>
                        {tableHead}
                        <TableBody>
                          {block.weeks.map((event) => (
                            <EventTableRow
                              key={event.id}
                              event={event}
                              onDeleteWeek={handleDeleteWeek}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <h2 className="mb-4 text-lg font-semibold text-foreground">Featured events</h2>
      {featuredEmptyMessage && featured.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground md:hidden">{featuredEmptyMessage}</p>
      ) : null}
      <ul className="space-y-3 md:hidden">
        {featured.map((event) => (
          <EventOccurrenceCard
            key={event.id}
            event={event}
            onDeleteWeek={handleDeleteWeek}
            showCategory
          />
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          {tableHead}
          <TableBody>
            {featured.map((event) => (
              <EventTableRow key={event.id} event={event} onDeleteWeek={handleDeleteWeek} />
            ))}
            {featuredEmptyMessage ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {featuredEmptyMessage}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
