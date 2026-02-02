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
                <Button variant="ghost" className="mb-6">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Events
                </Button>
            </Link>

            <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                    {/* Hero Image */}
                    {event.imageUrl && (
                        <div className="rounded-xl overflow-hidden shadow-sm aspect-video relative">
                            <img
                                src={event.imageUrl}
                                alt={event.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div>
                        <div className="flex gap-2 mb-2">
                            <Badge variant={event.category === 'FEATURED_EVENTS' ? 'default' : 'secondary'}>
                                {event.category.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline">{event.sportId.toUpperCase()}</Badge>
                        </div>
                        <h1 className="text-4xl font-bold mb-4">{event.title}</h1>
                        <div className="prose max-w-none text-muted-foreground">
                            {event.description}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Calendar className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="font-medium">Date</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(event.startTime as unknown as string).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="font-medium">Time</p>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(event.startTime as unknown as string).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} -
                                            {new Date(event.endTime as unknown as string).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                                    <div>
                                        <p className="font-medium">Location</p>
                                        <p className="text-sm text-muted-foreground mb-1">{event.locationId || "TBA"}</p>
                                        {event.addressUrl && (
                                            <a
                                                href={event.addressUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary text-xs flex items-center hover:underline"
                                            >
                                                Open in Maps <ExternalLink className="h-3 w-3 ml-1" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm">Member Price</span>
                                    <Badge variant="secondary">{event.tokensRequired} Tokens</Badge>
                                </div>
                                {(event.guestFee && event.guestFee > 0) && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">Guest Fee</span>
                                        <span className="font-medium">${event.guestFee}</span>
                                    </div>
                                )}
                            </div>

                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleRSVP}
                                disabled={rsvpLoading}
                            >
                                {rsvpLoading ? "Booking..." : "RSVP Now"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
