"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function MemberEventsPage() {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(true);
    const [rsvps, setRsvps] = useState<Record<string, { status: string; waitlistPosition: number | null }>>({});
    const [historyRsvps, setHistoryRsvps] = useState<MemberRsvpHistory[]>([]);
    const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);

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
                const map: Record<string, { status: string; waitlistPosition: number | null }> = {};
                for (const row of rows) {
                    if (row.eventId && (row.status === "CONFIRMED" || row.status === "WAITLISTED")) {
                        map[row.eventId] = {
                            status: row.status,
                            waitlistPosition: row.waitlistPosition ?? null,
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

    const handleCancel = async (eventId: string) => {
        if (!user) return;
        if (!confirm("Cancel this RSVP? Tokens held will be refunded if RSVP is still open.")) return;
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
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(null);
        }
    };

    if (loading || isLoadingEvents) {
        return <div className="p-8 text-center text-muted-foreground">Loading events...</div>;
    }

    const now = Date.now();
    const upcomingEvents = events.filter((event) => {
        const start = new Date(event.startTime as unknown as string).getTime();
        const end = new Date(event.endTime as unknown as string).getTime();
        const t = Number.isNaN(end) ? start : end;
        return Number.isFinite(t) && t >= now;
    });

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
                subtitle="Weekly sports and club events. A valid card is required to RSVP — tokens are held at signup."
            />
            <div className="mb-6">
                <Link href="/events/calendar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                    Club calendar
                </Link>
            </div>

            <AttendanceHistory rsvps={historyRsvps} />

            <h2 className="mb-4 text-2xl font-extrabold tracking-tight">Upcoming</h2>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                    <Card key={event.id} className="mz-lift flex flex-col">
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <Badge
                                    className={
                                        event.category === "FEATURED_EVENTS"
                                            ? "border-transparent bg-[color:var(--mz-coral)] text-white"
                                            : event.category === "WEEKLY_SPORTS"
                                              ? "border-transparent bg-[color:var(--mz-teal)] text-white"
                                              : undefined
                                    }
                                    variant="default"
                                >
                                    {event.category.replace('_', ' ')}
                                </Badge>
                                <Badge variant="outline">
                                    Up to {event.tokensMax ?? event.tokensRequired ?? 0} Token
                                    {(event.tokensMax ?? event.tokensRequired ?? 0) !== 1 && "s"}
                                </Badge>
                            </div>
                            <CardTitle className="mt-2">
                                <Link href={`/member/events/${event.id}`} className="hover:underline">
                                    {event.title}
                                </Link>
                            </CardTitle>
                            <CardDescription className="line-clamp-2">{event.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center">
                                <Calendar className="mr-2 h-4 w-4 text-[color:var(--mz-teal)]" />
                                {new Date(event.startTime as unknown as string).toLocaleString()}
                            </div>
                            <div className="flex items-center">
                                <MapPin className="mr-2 h-4 w-4 text-[color:var(--mz-coral)]" />
                                {event.locationId || "TBD"}
                            </div>
                            <div className="flex items-center">
                                <Users className="mr-2 h-4 w-4 text-[color:var(--mz-gold)]" />
                                Capacity: {event.capacity}
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-2">
                            {rsvps[event.id] ? (
                                <>
                                    <Badge className="w-full justify-center py-2" variant="outline">
                                        Already RSVP’d — {rsvps[event.id].status === "WAITLISTED"
                                            ? `Waitlisted${rsvps[event.id].waitlistPosition ? ` #${rsvps[event.id].waitlistPosition}` : ""}`
                                            : "Confirmed"}
                                    </Badge>
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
                                disabled={!!rsvpLoading || weeklyRsvpWindow(event) === "before" || weeklyRsvpWindow(event) === "closed"}
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

                {upcomingEvents.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                        No upcoming events found.
                    </div>
                )}
            </div>

            <div className="mt-10">
                <CalendarSyncCard />
            </div>
        </div>
    );
}
