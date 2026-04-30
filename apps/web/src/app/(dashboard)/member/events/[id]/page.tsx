"use client";

import { useEffect, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SportEvent } from "@/types";
import { Calendar, MapPin, Users, Clock, ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user } = useAuth();
    const router = useRouter();
    const [event, setEvent] = useState<SportEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [rsvpLoading, setRsvpLoading] = useState(false);

    useEffect(() => {
        async function fetchEvent() {
            try {
                // Fetch from public endpoint
                const res = await fetch(`/api/events/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setEvent(data);
                } else {
                    // error
                }
            } catch (error) {
                console.error("Failed to fetch event", error);
            } finally {
                setLoading(false);
            }
        }
        fetchEvent();
    }, [id]);

    const handleRSVP = async () => {
        if (!user) {
            router.push("/login");
            return;
        }
        setRsvpLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ eventId: id })
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Failed to RSVP");
                return;
            }

            alert("RSVP Successful!");
        } catch (error) {
            console.error("RSVP error", error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading event...</div>;
    if (!event) return <div className="p-8 text-center text-muted-foreground">Event not found</div>;

    return (
        <div className="container max-w-4xl py-8">
            <Link href="/member/events">
                <Button variant="ghost" className="mb-6 hover:bg-transparent pl-0 text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Events
                </Button>
            </Link>

            <div className="flex flex-col space-y-10">
                {/* Hero Section */}
                <div className="space-y-6">
                    {event.imageUrl && (
                        <div className="rounded-xl overflow-hidden shadow-sm aspect-video relative w-full border bg-muted">
                            <img
                                src={event.imageUrl}
                                alt={event.title}
                                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                            />
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge variant={event.category === 'FEATURED_EVENTS' ? 'default' : 'secondary'} className="rounded-sm">
                                {event.category.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className="rounded-sm uppercase tracking-wider">{event.sportId}</Badge>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">{event.title}</h1>
                    </div>
                </div>

                {/* Event Metadata Cards - Horizontal Stack */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border shadow-none rounded-xl bg-card/50">
                        <CardContent className="p-4 flex items-start gap-3">
                            <Calendar className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                                <p className="font-semibold text-sm">Date</p>
                                <p className="text-sm text-muted-foreground">
                                    {new Date(event.startTime as unknown as string).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border shadow-none rounded-xl bg-card/50">
                        <CardContent className="p-4 flex items-start gap-3">
                            <Clock className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                                <p className="font-semibold text-sm">Time</p>
                                <p className="text-sm text-muted-foreground">
                                    {new Date(event.startTime as unknown as string).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} -
                                    {new Date(event.endTime as unknown as string).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border shadow-none rounded-xl bg-card/50">
                        <CardContent className="p-4 flex items-start gap-3">
                            <MapPin className="h-5 w-5 text-primary mt-0.5" />
                            <div>
                                <p className="font-semibold text-sm">Location</p>
                                <p className="text-sm text-muted-foreground mb-1 line-clamp-1">{event.locationId || "TBA"}</p>
                                {event.addressUrl && (
                                    <a
                                        href={event.addressUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary text-xs font-medium flex items-center hover:underline"
                                    >
                                        Open in Maps <ExternalLink className="h-3 w-3 ml-1" />
                                    </a>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Description Section */}
                <div className="prose prose-neutral dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed md:text-lg">
                    {event.description}
                </div>

                {/* Registration & Fees Box (Full Width) */}
                <Card className="border-2 shadow-sm rounded-xl overflow-hidden bg-muted/30">
                    <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex flex-col md:flex-row gap-6 items-center w-full md:w-auto">
                            <div className="text-center md:text-left">
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Member Price</p>
                                <p className="text-3xl font-extrabold">{event.tokensRequired} <span className="text-lg font-medium text-muted-foreground">Tokens</span></p>
                            </div>
                            {(event.guestFee && event.guestFee > 0) ? (
                                <>
                                    <div className="hidden md:block w-px h-12 bg-border"></div>
                                    <div className="text-center md:text-left">
                                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Guest Fee</p>
                                        <p className="text-3xl font-extrabold">${event.guestFee}</p>
                                    </div>
                                </>
                            ) : null}
                        </div>
                        
                        <div className="w-full md:w-auto mt-4 md:mt-0">
                            <Button
                                className="w-full md:w-64 text-lg h-14 font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
                                size="lg"
                                onClick={handleRSVP}
                                disabled={rsvpLoading}
                            >
                                {rsvpLoading ? "Booking..." : "RSVP Now / Claim Spot"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
