"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock, DollarSign, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function EventsPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch("/api/events");
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data.events || []);
                }
            } catch (error) {
                console.error("Failed to fetch events", error);
            } finally {
                setLoading(false);
            }
        }
        fetchEvents();
    }, []);

    const formatDate = (dateString: any) => {
        if (!dateString) return "Date TBD";
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatTime = (dateString: any) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-16 flex justify-center">
                <div className="animate-pulse text-lg">Loading upcoming events...</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-16">
            <h1 className="text-4xl font-bold mb-8 text-center">Upcoming Events</h1>

            {events.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                    <p>No upcoming events at the moment. Check back soon!</p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {events.map((event) => (
                        <Card key={event.id} className="overflow-hidden flex flex-col h-full hover:shadow-lg transition-shadow">
                            {event.imageUrl && (
                                <div className="relative w-full h-48 bg-muted">
                                    <img
                                        src={event.imageUrl}
                                        alt={event.title}
                                        className="w-full h-full object-cover"
                                    />
                                    <Badge className="absolute top-2 right-2">{event.category.replace("_", " ")}</Badge>
                                </div>
                            )}

                            <CardHeader className={!event.imageUrl ? "pt-6" : "pt-4"}>
                                <div className="flex justify-between items-start">
                                    <h3 className="text-2xl font-bold line-clamp-2">{event.title}</h3>
                                    {!event.imageUrl && <Badge>{event.category.replace("_", " ")}</Badge>}
                                </div>
                                <div className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                                    {event.sportId.toUpperCase()}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4 flex-1">
                                {event.description && (
                                    <p className="text-muted-foreground line-clamp-3 text-sm">
                                        {event.description}
                                    </p>
                                )}

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-primary" />
                                        <span>{formatDate(event.startTime)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-primary" />
                                        <span>{formatTime(event.startTime)} - {formatTime(event.endTime)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-primary" />
                                        {event.addressUrl ? (
                                            <a
                                                href={event.addressUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline flex items-center gap-1"
                                            >
                                                {event.locationId || "View Map"}
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        ) : (
                                            <span>{event.locationId || "TBA"}</span>
                                        )}
                                    </div>

                                    {/* Fees */}
                                    <div className="flex items-center gap-4 pt-2">
                                        <Badge variant="secondary" className="font-normal">
                                            Members: {event.tokensRequired} Token{event.tokensRequired !== 1 && "s"}
                                        </Badge>
                                        {(event.guestFee && event.guestFee > 0) && (
                                            <Badge variant="outline" className="font-normal border-primary text-primary">
                                                Guests: ${event.guestFee}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter>
                                {user ? (
                                    <Link href={`/member/events/${event.id}`} className="w-full">
                                        <Button className="w-full">View Details & RSVP</Button>
                                    </Link>
                                ) : (
                                    <Link href="/login" className="w-full">
                                        <Button variant="outline" className="w-full">Login to Join</Button>
                                    </Link>
                                )}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

