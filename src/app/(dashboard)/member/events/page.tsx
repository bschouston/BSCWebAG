"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SportEvent } from "@/types";
import { Calendar, MapPin, Users } from "lucide-react";

export default function MemberEventsPage() {
    const { user, loading } = useAuth();
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
                alert(data.error || "Failed to RSVP");
                return;
            }

            alert("RSVP Successful!");
            // Ideally verify with toast and refetch data
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
        <div className="container py-8">
            <h1 className="text-3xl font-bold mb-8">Upcoming Events</h1>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                    <Card key={event.id} className="flex flex-col">
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <Badge variant={event.category === 'FEATURED_EVENTS' ? 'default' : 'secondary'}>
                                    {event.category.replace('_', ' ')}
                                </Badge>
                                <Badge variant="outline">{event.tokensRequired} Token{event.tokensRequired !== 1 && 's'}</Badge>
                            </div>
                            <CardTitle className="mt-2">{event.title}</CardTitle>
                            <CardDescription className="line-clamp-2">{event.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center">
                                <Calendar className="mr-2 h-4 w-4" />
                                {new Date(event.startTime as unknown as string).toLocaleString()}
                            </div>
                            <div className="flex items-center">
                                <MapPin className="mr-2 h-4 w-4" />
                                {event.locationId || "TBD"}
                            </div>
                            <div className="flex items-center">
                                <Users className="mr-2 h-4 w-4" />
                                Capacity: {event.capacity}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full"
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
