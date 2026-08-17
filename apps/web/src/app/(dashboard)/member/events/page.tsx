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

export default function MemberEventsPage() {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(true);
    const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);

    useEffect(() => {
        async function fetchEvents() {
            try {
                // Fetch public events for now. Ideally we fetch from /api/member/events which might include RSVP status
                // But for now let's reuse the public endpoint
                const res = await fetch("/api/events?limit=50");
                const data = await res.json();
                if (data.events) {
                    setEvents(data.events);
                }
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
        } catch (error) {
            console.error("RSVP error", error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(null);
        }
    };

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
                subtitle="Weekly sports and club events. A valid card is required to RSVP — tokens are held at signup."
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
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
                                    variant={event.category === "MONTHLY_EVENTS" ? "secondary" : "default"}
                                >
                                    {event.category.replace('_', ' ')}
                                </Badge>
                                <Badge variant="outline">
                                    Up to {event.tokensMax ?? event.tokensRequired ?? 0} Token
                                    {(event.tokensMax ?? event.tokensRequired ?? 0) !== 1 && "s"}
                                </Badge>
                            </div>
                            <CardTitle className="mt-2">{event.title}</CardTitle>
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
                        <CardFooter>
                            <Button
                                className="w-full bg-[color:var(--mz-navy)] font-semibold text-white hover:bg-[color:var(--mz-navy-deep)] hover:text-[color:var(--mz-gold)] dark:bg-[color:var(--mz-gold)] dark:text-[color:var(--mz-navy)] dark:hover:bg-white"
                                onClick={() => handleRSVP(event.id)}
                                disabled={!!rsvpLoading}
                            >
                                {rsvpLoading === event.id ? "Booking..." : "RSVP Now"}
                            </Button>
                        </CardFooter>
                    </Card>
                ))}

                {events.length === 0 && (
                    <div className="col-span-full text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                        No upcoming events found.
                    </div>
                )}
            </div>
        </div>
    );
}
