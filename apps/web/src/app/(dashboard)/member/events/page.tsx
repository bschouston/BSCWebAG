"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SportEvent } from "@/types";
import { Calendar, MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { memberAreaTitle, memberFullName } from "@/lib/member-name";
import { MemberPageHeader } from "@/components/dashboard/member-page-header";
import { CalendarSyncCard } from "@/components/calendar-sync-card";
import { AttendanceHistory, type MemberRsvpHistory } from "@/components/attendance-history";
import Link from "next/link";
import { weeklyRsvpWindow } from "@/lib/rsvp-window";
import { chicagoTimeOnlyLabel, isWeeklyRsvpEvent } from "@/lib/weekly-rsvp";
import { teamContrastText } from "@/lib/weekly-team-colors";
import { useSportsCatalog } from "@/hooks/use-sports-catalog";
import { usePersistedSportFilter } from "@/hooks/use-persisted-sport-filter";
import { sortSportFilterIds, sportFilterLabel } from "@/lib/sport-filter-storage";
import { SportFilterChips } from "@/components/sport-filter-chips";

const WEEKLY_SPORT_FILTER_KEY = "bsc.member-events.weekly-sports";

function featuredEventHref(event: SportEvent) {
    if (event.slug) return `/events/${event.slug}`;
    return "/events";
}

function isUpcomingEvent(event: SportEvent, now: number) {
    const start = new Date(event.startTime as unknown as string).getTime();
    const end = new Date(event.endTime as unknown as string).getTime();
    const t = Number.isNaN(end) ? start : end;
    return Number.isFinite(t) && t >= now;
}

function ordinalDay(day: number) {
    const teen = day % 100;
    const ones = day % 10;
    if (teen >= 11 && teen <= 13) return `${day}th`;
    if (ones === 1) return `${day}st`;
    if (ones === 2) return `${day}nd`;
    if (ones === 3) return `${day}rd`;
    return `${day}th`;
}

function formatEventWhen(start: unknown) {
    const d = new Date(start as string);
    if (Number.isNaN(d.getTime())) return "Date TBD";
    const month = d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long" });
    const day = Number(d.toLocaleDateString("en-US", { timeZone: "America/Chicago", day: "numeric" }));
    const time = chicagoTimeOnlyLabel(start);
    return `${month} ${ordinalDay(day)} @ ${time}`;
}

export default function MemberEventsPage() {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const { sports } = useSportsCatalog();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(true);
    const [rsvps, setRsvps] = useState<
        Record<string, { status: string; waitlistPosition: number | null; teamName?: string | null; teamColor?: string | null }>
    >({});
    const [historyRsvps, setHistoryRsvps] = useState<MemberRsvpHistory[]>([]);
    const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
    const { selectedSports, sportFilterReady, toggleSportFilter, clearSportFilter } =
        usePersistedSportFilter(WEEKLY_SPORT_FILTER_KEY);

    useEffect(() => {
        async function fetchEvents() {
            try {
                const token = await user?.getIdToken();
                const [eventsRes, rsvpRes] = await Promise.all([
                    fetch("/api/events?limit=50"),
                    fetch("/api/member/rsvps", {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    }),
                ]);
                const data = await eventsRes.json();
                if (data.events) setEvents(data.events);
                const rsvpData = await rsvpRes.json().catch(() => ({}));
                const rows = (rsvpData.rsvps || []) as MemberRsvpHistory[];
                setHistoryRsvps(rows);
                const map: Record<
                    string,
                    { status: string; waitlistPosition: number | null; teamName?: string | null; teamColor?: string | null }
                > = {};
                for (const row of rows) {
                    if (
                        row.eventId &&
                        row.event?.category === "WEEKLY_SPORTS" &&
                        (row.status === "CONFIRMED" || row.status === "WAITLISTED")
                    ) {
                        map[row.eventId] = {
                            status: row.status,
                            waitlistPosition: row.waitlistPosition ?? null,
                            teamName: (row as { teamName?: string | null }).teamName ?? null,
                            teamColor: (row as { teamColor?: string | null }).teamColor ?? null,
                        };
                    }
                }
                setRsvps(map);
            } catch (error) {
                console.error("Failed to fetch events", error);
            } finally {
                setIsLoadingEvents(false);
            }
        }

        if (user) {
            fetchEvents();
        }
    }, [user]);

    const handleRSVP = async (eventId: string) => {
        if (!user) return;
        setRsvpLoading(eventId);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ eventId })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.code === "CARD_REQUIRED") {
                    alert(data.error + "\n\nOpening My Wallet to add a card…");
                    router.push("/member/wallet");
                    return;
                }
                if (data.code === "INSUFFICIENT_TOKENS") {
                    router.push(`/member/events/${eventId}`);
                    return;
                }
                if (data.code === "TOKEN_REQUEST_PENDING") {
                    alert(data.error || "Pay the Super Admin token request in My Wallet first.");
                    router.push("/member/wallet");
                    return;
                }
                alert(data.error || "Failed to RSVP");
                return;
            }

            const held = data.tokensHeld;
            if (held) {
                alert(`RSVP Successful (${data.status}). Up to ${held} tokens held.`);
            } else {
                alert("RSVP Successful!");
            }
            setRsvps((prev) => ({
                ...prev,
                [eventId]: { status: data.status, waitlistPosition: data.waitlistPosition ?? null },
            }));
        } catch (error) {
            console.error("RSVP error", error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(null);
        }
    };

    const handleCancel = async (eventId: string, options?: { mistakenFeatured?: boolean }) => {
        if (!user) return;
        const confirmed = options?.mistakenFeatured
            ? confirm("Remove this mistaken RSVP? Your tournament registration is not affected.")
            : confirm("Cancel this RSVP? Tokens held will be refunded if RSVP is still open.");
        if (!confirmed) return;
        setRsvpLoading(eventId);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ eventId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || "Could not cancel");
                return;
            }
            setRsvps((prev) => {
                const next = { ...prev };
                delete next[eventId];
                return next;
            });
            setHistoryRsvps((prev) =>
                prev.map((row) =>
                    row.eventId === eventId && (row.status === "CONFIRMED" || row.status === "WAITLISTED")
                        ? { ...row, status: "CANCELLED" }
                        : row
                )
            );
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(null);
        }
    };

    const upcomingWeekly = useMemo(() => {
        const at = Date.now();
        return events.filter((event) => isWeeklyRsvpEvent(event) && isUpcomingEvent(event, at));
    }, [events]);
    const upcomingFeatured = useMemo(() => {
        const at = Date.now();
        return events.filter((event) => event.category === "FEATURED_EVENTS" && isUpcomingEvent(event, at));
    }, [events]);

    const weeklyHistory = historyRsvps.filter((row) => isWeeklyRsvpEvent(row.event));
    const mistakenFeaturedRsvps = historyRsvps.filter(
        (row) =>
            row.event?.category === "FEATURED_EVENTS" &&
            (row.status === "CONFIRMED" || row.status === "WAITLISTED")
    );

    const weeklySportOptions = useMemo(() => {
        const ids = [...new Set(upcomingWeekly.map((e) => e.sportId).filter(Boolean))];
        return sortSportFilterIds(ids, sports);
    }, [upcomingWeekly, sports]);

    const filteredWeekly = useMemo(() => {
        if (!sportFilterReady || selectedSports.length === 0) return upcomingWeekly;
        const allowed = new Set(selectedSports);
        return upcomingWeekly.filter((event) => allowed.has(event.sportId));
    }, [upcomingWeekly, selectedSports, sportFilterReady]);

    const sportFilterActive = selectedSports.length > 0;

    if (loading || isLoadingEvents) {
        return <div className="p-8 text-center text-muted-foreground">Loading events...</div>;
    }

    return (
        <div className="mx-auto max-w-6xl">
            <MemberPageHeader
                title={memberAreaTitle(
                    memberFullName({
                        firstName: profile?.firstName,
                        lastName: profile?.lastName,
                        displayName: user?.displayName,
                    }),
                    "Events"
                )}
                subtitle="Weekly sports sign-up. Featured tournaments register on the public event page."
            />
            <div className="mb-6">
                <Link href="/events/calendar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                    Club calendar
                </Link>
            </div>

            <AttendanceHistory rsvps={weeklyHistory} />

            {mistakenFeaturedRsvps.length > 0 ? (
                <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-medium">Featured event RSVP recorded by mistake</p>
                    <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
                        Tournament registration uses the event registration form, not weekly RSVP. Remove
                        the mistaken entry below — this does not affect your tournament registration.
                    </p>
                    <ul className="mt-3 space-y-2">
                        {mistakenFeaturedRsvps.map((row) => (
                            <li
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-white/60 px-3 py-2 dark:border-amber-800 dark:bg-black/20"
                            >
                                <span>{row.event?.title ?? "Featured event"}</span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!!rsvpLoading}
                                    onClick={() => void handleCancel(row.eventId!, { mistakenFeatured: true })}
                                >
                                    {rsvpLoading === row.eventId ? "Removing…" : "Remove mistaken RSVP"}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {upcomingFeatured.length > 0 ? (
                <section className="mb-10">
                    <h2 className="mb-4 text-2xl font-extrabold tracking-tight">Featured tournaments</h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                        Register on the tournament page. Featured events are not part of weekly RSVP.
                    </p>
                    <div className="grid gap-6">
                        {upcomingFeatured.map((event) => {
                            const href = featuredEventHref(event);
                            return (
                                <Card key={event.id} className="mz-lift overflow-hidden">
                                    <Link href={href} className="block bg-muted">
                                        {event.imageUrl ? (
                                            <img
                                                src={event.imageUrl}
                                                alt={event.title}
                                                className="block h-auto w-full"
                                            />
                                        ) : (
                                            <div className="flex min-h-[10rem] items-center justify-center px-4 py-8 text-center">
                                                <span className="text-lg font-semibold text-[#1a3556] dark:text-white">
                                                    {event.title}
                                                </span>
                                            </div>
                                        )}
                                    </Link>
                                    <CardHeader>
                                        <Badge className="w-fit border-transparent bg-[color:var(--mz-coral)] text-white">
                                            Featured Events
                                        </Badge>
                                        <CardTitle className="mt-2">
                                            <Link
                                                href={href}
                                                className="text-[#1a3556] hover:underline dark:text-white"
                                            >
                                                {event.title}
                                            </Link>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2.5">
                                        <div className="flex items-center text-base font-semibold text-[#1a3556] dark:text-[#ffd700]">
                                            <Calendar className="mr-2 h-4 w-4 shrink-0 text-[color:var(--mz-teal)]" />
                                            {formatEventWhen(event.startTime)}
                                        </div>
                                        <div className="flex items-center text-sm font-medium text-[#1a3556] dark:text-foreground">
                                            <MapPin className="mr-2 h-4 w-4 shrink-0 text-[color:var(--mz-coral)]" />
                                            {event.locationId || event.eventLocation || "TBD"}
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <Button
                                            asChild
                                            className="w-full bg-[#1a3556] font-semibold text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
                                        >
                                            <Link href={href}>View tournament &amp; register</Link>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            <h2 className="mb-4 text-2xl font-extrabold tracking-tight">Upcoming weekly events</h2>

            <SportFilterChips
                sportIds={weeklySportOptions}
                selectedSports={selectedSports}
                sports={sports}
                onToggle={toggleSportFilter}
                onClear={clearSportFilter}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredWeekly.map((event) => (
                    <Card key={event.id} className="mz-lift relative flex cursor-pointer flex-col overflow-hidden gap-0 p-0">
                        <Link
                            href={`/member/events/${event.id}`}
                            className="absolute inset-0 z-0 rounded-[inherit]"
                            aria-label={event.title}
                        />
                        <div className="pointer-events-none relative h-32 w-full shrink-0 overflow-hidden bg-muted sm:h-36">
                            {event.imageUrl ? (
                                <img
                                    src={event.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full w-full items-end bg-gradient-to-br from-[#1a3556] via-[#2a4a72] to-[color:var(--mz-teal)] p-4">
                                    <span className="text-sm font-semibold uppercase tracking-wider text-white/90">
                                        {sportFilterLabel(event.sportId, sports)}
                                    </span>
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
                            <div className="absolute bottom-3 left-4 right-4 z-[1] flex flex-wrap items-center justify-between gap-2">
                                <Badge className="border-transparent bg-[color:var(--mz-teal)] text-white shadow-sm">
                                    {event.category.replace("_", " ")}
                                </Badge>
                                <Badge variant="outline" className="border-border bg-card/95 text-foreground shadow-sm">
                                    Up to {event.tokensMax ?? event.tokensRequired ?? 0} Token
                                    {(event.tokensMax ?? event.tokensRequired ?? 0) !== 1 && "s"}
                                </Badge>
                            </div>
                        </div>
                        <div className="pointer-events-none flex flex-1 flex-col gap-3 px-6 pt-5">
                            <CardTitle className="text-lg font-bold leading-snug text-[#1a3556] dark:text-foreground sm:text-xl">
                                {event.title}
                            </CardTitle>
                            <p className="flex items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--mz-gold)_28%,var(--border))] bg-[color:color-mix(in_srgb,var(--mz-gold)_10%,var(--card))] px-3 py-2 text-base font-bold leading-snug text-[#1a3556] dark:border-[color:color-mix(in_srgb,var(--mz-gold)_40%,transparent)] dark:bg-[color:color-mix(in_srgb,var(--mz-gold)_12%,transparent)] dark:text-[#ffd700]">
                                <Calendar className="h-5 w-5 shrink-0 text-[color:var(--mz-teal)]" />
                                <span>{formatEventWhen(event.startTime)}</span>
                            </p>
                            <div className="grid grid-cols-1 gap-2 pb-1">
                                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-semibold leading-snug text-[#1a3556] dark:text-foreground">
                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--mz-coral)]" />
                                    <span>{event.locationId || "TBD"}</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-semibold leading-snug text-[#1a3556] dark:text-foreground">
                                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--mz-gold)]" />
                                    <span>Capacity: {event.capacity}</span>
                                </div>
                            </div>
                        </div>
                        <CardFooter className="relative z-10 mt-2 flex flex-col gap-2 px-6 pb-6 pt-0">
                            {rsvps[event.id] ? (
                                <>
                                    <Badge className="w-full justify-center py-2" variant="outline">
                                        Already RSVP’d — {rsvps[event.id].status === "WAITLISTED"
                                            ? `Waitlisted${rsvps[event.id].waitlistPosition ? ` #${rsvps[event.id].waitlistPosition}` : ""}`
                                            : "Confirmed"}
                                    </Badge>
                                    {event.category === "WEEKLY_SPORTS" && rsvps[event.id].teamName ? (
                                        <Badge
                                            className="w-full justify-center border-transparent py-2 font-semibold"
                                            style={{
                                                backgroundColor: rsvps[event.id].teamColor || "#1a3556",
                                                color: teamContrastText(rsvps[event.id].teamColor || "#1a3556"),
                                            }}
                                        >
                                            {rsvps[event.id].teamName}
                                        </Badge>
                                    ) : null}
                                    {event.category === "WEEKLY_SPORTS" && weeklyRsvpWindow(event) !== "closed" ? (
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            disabled={!!rsvpLoading}
                                            onClick={() => void handleCancel(event.id)}
                                        >
                                            {rsvpLoading === event.id ? "Cancelling…" : "Cancel RSVP"}
                                        </Button>
                                    ) : event.category === "WEEKLY_SPORTS" ? (
                                        <p className="text-center text-xs text-muted-foreground">RSVP closed — admin can cancel</p>
                                    ) : null}
                                </>
                            ) : (
                            <Button
                                className="w-full bg-[color:var(--mz-navy)] font-semibold text-white hover:bg-[color:var(--mz-navy-deep)] hover:text-[color:var(--mz-gold)] dark:bg-[color:var(--mz-gold)] dark:text-[color:var(--mz-navy)] dark:hover:bg-white"
                                onClick={() => handleRSVP(event.id)}
                                disabled={
                                    !!rsvpLoading ||
                                    !isWeeklyRsvpEvent(event) ||
                                    weeklyRsvpWindow(event) === "before" ||
                                    weeklyRsvpWindow(event) === "closed"
                                }
                            >
                                {rsvpLoading === event.id
                                    ? "Booking..."
                                    : weeklyRsvpWindow(event) === "before"
                                      ? "RSVP not open yet"
                                      : weeklyRsvpWindow(event) === "closed"
                                        ? "RSVP closed"
                                        : "RSVP Now"}
                            </Button>
                            )}
                        </CardFooter>
                    </Card>
                ))}

                {filteredWeekly.length === 0 && upcomingWeekly.length > 0 && sportFilterActive ? (
                    <div className="col-span-full rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                        No weekly events match your sport filter.{" "}
                        <button
                            type="button"
                            className="underline underline-offset-4"
                            onClick={clearSportFilter}
                        >
                            Show all sports
                        </button>
                    </div>
                ) : null}

                {upcomingWeekly.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                        No upcoming weekly events found.{" "}
                        <Link href="/events" className="underline underline-offset-4">
                            Browse featured tournaments
                        </Link>
                    </div>
                )}
            </div>

            <div className="mt-10">
                <CalendarSyncCard />
            </div>
        </div>
    );
}
