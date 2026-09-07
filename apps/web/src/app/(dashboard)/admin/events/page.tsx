"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SportEvent } from "@/types";
import { weeklyDetailsEditLocked, weeklyOccurrenceFinished, weeklyOccurrenceHardDeletable, weeklyOccurrenceHardDeleteBlockedReason, weeklyOccurrenceOverdue, weeklyRsvpWindow } from "@/lib/weekly-rsvp";
import { weeklySeriesCardTitle } from "@/lib/weekly-series-display";
import { WeeklySeriesActions } from "@/components/admin/weekly-series-actions";
import { SportFilterChips } from "@/components/sport-filter-chips";
import { useSportsCatalog } from "@/hooks/use-sports-catalog";
import { usePersistedSportFilter } from "@/hooks/use-persisted-sport-filter";
import { sortSportFilterIds } from "@/lib/sport-filter-storage";
import { cn } from "@/lib/utils";
import { Edit, Plus, Settings2, Trash2 } from "lucide-react";

const ADMIN_SPORT_FILTER_KEY = "bsc.admin-events.sports";

type SeriesMeta = {
  id: string;
  title: string;
  adminLabel?: string | null;
  paused: boolean;
  sportId?: string;
};

const PAST_LOOKBACK_DAYS = 14;

function weekInDefaultView(event: SportEvent, now = new Date()): boolean {
  if (weeklyOccurrenceOverdue(event, now)) return true;
  if (event.status === "PUBLISHED") return true;
  return false;
}

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
  onDeleteWeek: (event: SportEvent) => void;
  className?: string;
  manageFullWidth?: boolean;
}) {
  const editLocked = weeklyOccurrenceFinished(event) || weeklyDetailsEditLocked(event);
  const canHardDelete = weeklyOccurrenceHardDeletable(event);
  const deleteBlockedReason = weeklyOccurrenceHardDeleteBlockedReason(event);

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
        className={
          canHardDelete
            ? "text-destructive hover:text-destructive"
            : "disabled:bg-muted disabled:text-foreground disabled:opacity-100"
        }
        disabled={!canHardDelete}
        title={
          canHardDelete
            ? "Delete unused future week"
            : deleteBlockedReason ?? "Cannot delete this week"
        }
        onClick={() => {
          if (!canHardDelete) return;
          onDeleteWeek(event);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EventStatusCell({ event }: { event: SportEvent }) {
  const overdue = weeklyOccurrenceOverdue(event);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={event.status === "PUBLISHED" ? "default" : "secondary"}>{event.status}</Badge>
      {overdue ? (
        <Badge className="border-transparent bg-amber-600 text-white dark:bg-amber-500 dark:text-[#122540]">
          OVERDUE
        </Badge>
      ) : null}
      {!overdue && weeklyRsvpWindow(event) === "open" ? (
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
  onDeleteWeek: (event: SportEvent) => void;
  showCategory?: boolean;
}) {
  return (
    <li className="space-y-3 rounded-lg border bg-background p-3 shadow-sm">
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
  index = 0,
}: {
  event: SportEvent;
  onDeleteWeek: (event: SportEvent) => void;
  index?: number;
}) {
  return (
    <TableRow
      className={cn(
        "border-b border-border/80",
        index % 2 === 1
          ? "bg-muted/70 hover:bg-muted/85 dark:bg-white/[0.12] dark:hover:bg-white/[0.16]"
          : "bg-background hover:bg-muted/35 dark:bg-background dark:hover:bg-white/[0.06]"
      )}
    >
      <TableCell className="font-medium text-foreground">{event.title}</TableCell>
      <TableCell className="font-semibold tabular-nums text-foreground">{eventDateLabel(event)}</TableCell>
      <TableCell>
        <Badge variant="outline">{event.category.replace("_", " ")}</Badge>
      </TableCell>
      <TableCell className="tabular-nums text-foreground">{event.capacity}</TableCell>
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
  const [showPast, setShowPast] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SportEvent | null>(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchAll = async (includePast = showPast) => {
    try {
      const token = await user?.getIdToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const eventsQs = new URLSearchParams({
        includePast: includePast ? "1" : "0",
        pastLookbackDays: String(PAST_LOOKBACK_DAYS),
      });
      const [eventsRes, seriesRes] = await Promise.all([
        fetch(`/api/events?${eventsQs}`, { headers }),
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
    void fetchAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleShowPast = () => {
    const next = !showPast;
    setShowPast(next);
    setLoading(true);
    void fetchAll(next);
  };

  const closeDeleteWeek = () => {
    setDeleteTarget(null);
    setDeleteTyped("");
    setDeleteError(null);
  };

  const openDeleteWeek = (event: SportEvent) => {
    setDeleteTarget(event);
    setDeleteTyped("");
    setDeleteError(null);
  };

  const confirmDeleteWeek = async () => {
    if (!deleteTarget || !user) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/events/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id));
        closeDeleteWeek();
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(typeof data.error === "string" ? data.error : "Failed to delete event");
      }
    } catch (error) {
      console.error(error);
      setDeleteError("Error deleting event");
    } finally {
      setDeleteBusy(false);
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
    templateTitle: string;
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
      title: weeklySeriesCardTitle(meta),
      templateTitle: meta.title,
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
      templateTitle: weeks[0]?.title || "Weekly series",
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
      templateTitle: weeks[0]?.title || "Weekly sport",
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
  const featured = (sportFilterActive ? featuredAll.filter((e) => matchesSport(e.sportId)) : featuredAll).filter(
    (e) => showPast || e.status === "PUBLISHED" || e.status === "DRAFT"
  );
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
    <TableHeader className="bg-muted/50 dark:bg-muted/35 [&_tr]:border-b-2 [&_tr]:border-border">
      <TableRow className="hover:bg-transparent">
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
          <Button type="button" variant="outline" onClick={toggleShowPast}>
            {showPast ? "Hide past events" : "Show past events"}
          </Button>
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
        <div className="mb-10 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Weekly series</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each card is one series. Rename changes the card label only. Pause, duplicate, and delete apply only to
                that series.
              </p>
            </div>
          </div>
          {sportFilterActive && seriesBlocksAll.length > 0 && seriesBlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No weekly series match your sport filter.{" "}
              <button type="button" className="underline underline-offset-4" onClick={clearSportFilter}>
                Show all sports
              </button>
            </p>
          ) : null}
          {seriesBlocks.map((block) => {
            const visibleWeeks = showPast
              ? block.weeks
              : block.weeks.filter((week) => weekInDefaultView(week));
            const hiddenPastCount = block.weeks.length - visibleWeeks.length;
            return (
            <Card
              key={block.id}
              className="relative overflow-hidden border-border/80 shadow-sm dark:border-border dark:shadow-none"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
              />
              <CardHeader className="flex flex-col gap-3 border-b bg-muted/30 dark:bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[#8a6d00] dark:text-[#ffd700]">
                    {block.canManageSeries ? "Series" : "One-time Event"}
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
                    title={block.templateTitle}
                    cardTitle={block.title}
                    onChanged={() => void fetchAll(showPast)}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {visibleWeeks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {block.weeks.length === 0
                      ? "No weeks on the calendar yet."
                      : hiddenPastCount > 0
                        ? `${hiddenPastCount} past week${hiddenPastCount === 1 ? "" : "s"} hidden. Use Show past events.`
                        : "No upcoming weeks in this series."}
                  </p>
                ) : (
                  <div className="rounded-lg border bg-muted/40 p-2 dark:bg-muted/25">
                    <ul className="space-y-3 md:hidden">
                      {visibleWeeks.map((event) => (
                        <EventOccurrenceCard
                          key={event.id}
                          event={event}
                          onDeleteWeek={openDeleteWeek}
                        />
                      ))}
                    </ul>
                    <div className="hidden overflow-x-auto rounded-md border bg-background md:block">
                      <Table>
                        {tableHead}
                        <TableBody>
                          {visibleWeeks.map((event, index) => (
                            <EventTableRow
                              key={event.id}
                              event={event}
                              index={index}
                              onDeleteWeek={openDeleteWeek}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {!showPast && hiddenPastCount > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {hiddenPastCount} past week{hiddenPastCount === 1 ? "" : "s"} hidden.
                      </p>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      ) : null}

      <section className="mt-2 border-t pt-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Featured events</h2>
        {featuredEmptyMessage && featured.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground md:hidden">{featuredEmptyMessage}</p>
        ) : null}
        <div className="rounded-lg border bg-muted/40 p-2 dark:bg-muted/25">
          <ul className="space-y-3 md:hidden">
            {featured.map((event) => (
              <EventOccurrenceCard
                key={event.id}
                event={event}
                              onDeleteWeek={openDeleteWeek}
                showCategory
              />
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-md border bg-background md:block">
            <Table>
              {tableHead}
              <TableBody>
                {featured.map((event, index) => (
                  <EventTableRow
                    key={event.id}
                    event={event}
                    index={index}
                              onDeleteWeek={openDeleteWeek}
                  />
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
      </section>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => (next ? undefined : closeDeleteWeek())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.category === "WEEKLY_SPORTS" ? "Delete this week?" : "Delete this event?"}
            </DialogTitle>
            <DialogDescription className="space-y-2 text-left">
              {deleteTarget ? (
                <>
                  <span className="block text-foreground">
                    You are deleting{" "}
                    <span className="font-semibold">
                      {deleteTarget.title}
                      {deleteTarget.startTime ? ` (${eventDateLabel(deleteTarget)})` : ""}
                    </span>
                    {deleteTarget.category === "WEEKLY_SPORTS"
                      ? deleteTarget.seriesId
                        ? ", a week in a series."
                        : ", a one-time weekly event."
                      : "."}
                  </span>
                  {deleteTarget.category === "WEEKLY_SPORTS" ? (
                    <span className="block">
                      Only this unused future week is removed. Live weeks with RSVPs open or closed must
                      be cancelled from Manage instead. This cannot be undone.
                    </span>
                  ) : (
                    <span className="block">This cannot be undone.</span>
                  )}
                  <span className="block">
                    Type <span className="font-mono font-semibold text-foreground">DELETE</span> to
                    confirm.
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteTyped}
            onChange={(e) => setDeleteTyped(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={deleteBusy}
          />
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={deleteBusy} onClick={closeDeleteWeek}>
              Back
            </Button>
            <Button
              variant="destructive"
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={deleteTyped.trim().toUpperCase() !== "DELETE" || deleteBusy}
              onClick={() => void confirmDeleteWeek()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
