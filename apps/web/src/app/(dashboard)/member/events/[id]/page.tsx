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
                alert(
                    `RSVP Successful (${data.status}). Up to ${held} tokens held; final amount is set after the event.`
                );
            } else {
                alert(`RSVP Successful (${data.status})!`);
            }
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
        <div className="mx-auto max-w-4xl">
            <Link href="/member/events">
                <Button variant="ghost" className="mb-4 pl-0 text-muted-foreground hover:bg-transparent hover:text-[color:var(--mz-gold)]">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to My Events
                </Button>
            </Link>

            <div className="flex flex-col space-y-10">
                <div className="mz-header space-y-6">
                    {event.imageUrl && (
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--mz-gold)_35%,transparent)] bg-muted">
                            <img
                                src={event.imageUrl}
                                alt={event.title}
                                className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                            />
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge
                                className={
                                    event.category === "FEATURED_EVENTS"
                                        ? "rounded-sm border-transparent bg-[color:var(--mz-coral)] text-white"
                                        : event.category === "WEEKLY_SPORTS"
                                          ? "rounded-sm border-transparent bg-[color:var(--mz-teal)] text-white"
                                          : "rounded-sm"
                                }
                                variant={event.category === "MONTHLY_EVENTS" ? "secondary" : "default"}
                            >
                                {event.category.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline" className="rounded-sm uppercase tracking-wider">{event.sportId}</Badge>
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl">{event.title}</h1>
                        <div className="mz-rule" />
                    </div>
                </div>

                {/* Event Metadata Cards - Horizontal Stack */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border shadow-none rounded-xl bg-card/50">
                        <CardContent className="p-4 flex items-start gap-3">
                            <Calendar className="mt-0.5 h-5 w-5 text-[color:var(--mz-teal)]" />
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
                            <Clock className="mt-0.5 h-5 w-5 text-[color:var(--mz-gold)]" />
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
                            <MapPin className="mt-0.5 h-5 w-5 text-[color:var(--mz-coral)]" />
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
                <Card className="overflow-hidden border-[color:color-mix(in_srgb,var(--mz-gold)_35%,transparent)] bg-[linear-gradient(135deg,var(--mz-navy-deep),var(--mz-navy))] text-white">
                    <CardContent className="flex flex-col items-center justify-between gap-6 p-6 md:flex-row md:p-8">
                        <div className="flex w-full flex-col items-center gap-6 md:w-auto md:flex-row md:items-center">
                            <div className="text-center md:text-left">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--mz-gold)]">
                                    Token hold
                                </p>
                                <p className="text-3xl font-extrabold">
                                    {event.tokensMax ?? event.tokensRequired ?? 0}{" "}
                                    <span className="text-lg font-medium text-white/70">Tokens</span>
                                </p>
                                {(event.tokensMin != null || event.tokensMax != null) &&
                                (event.tokensMin ?? 0) !== (event.tokensMax ?? event.tokensRequired) ? (
                                    <p className="mt-1 text-xs text-white/70">
                                        Range {event.tokensMin ?? "—"}–{event.tokensMax ?? event.tokensRequired}; held at max until the event is finalized.
                                    </p>
                                ) : (
                                    <p className="mt-1 text-xs text-white/70">
                                        A valid card is required. Tokens are held at RSVP.
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <div className="mt-4 w-full md:mt-0 md:w-auto">
                            <Button
                                className="h-14 w-full bg-[color:var(--mz-gold)] text-lg font-semibold text-[color:var(--mz-navy)] hover:bg-white md:w-64"
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
