"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SportEvent } from "@/types";
import { Calendar, MapPin, Clock, ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { weeklyRsvpWindow } from "@/lib/rsvp-window";
import { WeeklyTokenHoldExplainer } from "@/components/member/weekly-token-hold-explainer";
import { RsvpTokenActions } from "@/components/member/rsvp-token-actions";
import { weeklyTokenHoldAmounts } from "@/lib/weekly-tokens";
import { loginHref } from "@/lib/auth/return-url";
import { eventPagePath } from "@/lib/calendar-urls";
import { weeklyOccurrenceStarted } from "@/lib/weekly-rsvp";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [event, setEvent] = useState<SportEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const [holdChangedNote, setHoldChangedNote] = useState<string | null>(null);
    const [myRsvp, setMyRsvp] = useState<{
        status: string;
        waitlistPosition: number | null;
        tokensHeld?: number | null;
        pendingTokenIncreaseTo?: number | null;
    } | null>(null);

    const loadEvent = useCallback(async () => {
        try {
            const token = await user?.getIdToken();
            const [eventRes, rsvpRes] = await Promise.all([
                fetch(`/api/events/${id}`),
                user
                    ? fetch("/api/member/rsvps", {
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                      })
                    : Promise.resolve(null),
            ]);
            if (eventRes.ok) {
                setEvent(await eventRes.json());
            }
            if (rsvpRes?.ok) {
                const data = await rsvpRes.json();
                const row = (data.rsvps || []).find(
                    (r: { eventId?: string; status?: string }) =>
                        r.eventId === id && (r.status === "CONFIRMED" || r.status === "WAITLISTED")
                );
                if (row) {
                    setMyRsvp({
                        status: row.status,
                        waitlistPosition: row.waitlistPosition ?? null,
                        tokensHeld: row.tokensHeld ?? null,
                        pendingTokenIncreaseTo: row.pendingTokenIncreaseTo ?? null,
                    });
                } else {
                    setMyRsvp(null);
                }
            }
        } catch (error) {
            console.error("Failed to fetch event", error);
        } finally {
            setLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        if (authLoading || loading || !event) return;
        if (event.category === "WEEKLY_SPORTS" && !user) {
            router.replace(loginHref(`/member/events/${id}`));
            return;
        }
        if (event.category === "FEATURED_EVENTS" && event.slug) {
            router.replace(eventPagePath(event));
        }
    }, [authLoading, loading, event, user, id, router]);

    useEffect(() => {
        void loadEvent();
    }, [loadEvent]);

    const handleRSVP = async (
        purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
    ): Promise<boolean> => {
        if (!user) {
            router.push(loginHref(`/member/events/${id}`));
            return false;
        }
        setRsvpLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ eventId: id, ...(purchase ? { purchase } : {}) }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.code === "CARD_REQUIRED") {
                    alert(data.error + "\n\nOpening My Wallet to add a card…");
                    router.push("/member/wallet");
                    return false;
                }
                if (data.code === "INSUFFICIENT_TOKENS") {
                    return false;
                }
                alert(data.error || "Failed to RSVP");
                return false;
            }

            const held = data.tokensHeld;
            if (held) {
                alert(
                    `RSVP Successful (${data.status}). Up to ${held} tokens held; final amount is set after the event.`
                );
            } else {
                alert(`RSVP Successful (${data.status})!`);
            }
            setMyRsvp({
                status: data.status,
                waitlistPosition: data.waitlistPosition ?? null,
                tokensHeld: data.tokensHeld ?? null,
                pendingTokenIncreaseTo: null,
            });
            return true;
        } catch (error) {
            console.error("RSVP error", error);
            alert("An error occurred");
            return false;
        } finally {
            setRsvpLoading(false);
        }
    };

    const handleAuthorizeIncrease = async (
        purchase?: { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string }
    ): Promise<boolean> => {
        if (!user) return false;
        setRsvpLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps/authorize-increase", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    eventId: id,
                    expectedPendingTo: myRsvp?.pendingTokenIncreaseTo ?? 0,
                    ...(purchase ? { purchase } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.code === "INSUFFICIENT_TOKENS") return false;
                if (data.code === "HOLD_CHANGED") {
                    setHoldChangedNote(
                        typeof data.error === "string"
                            ? data.error
                            : "The token hold changed. Review the updated amount to authorize."
                    );
                    await loadEvent();
                    return false;
                }
                alert(data.error || "Could not authorize");
                return false;
            }
            setHoldChangedNote(null);
            setMyRsvp((prev) =>
                prev
                    ? {
                          ...prev,
                          tokensHeld: data.tokensHeld ?? prev.pendingTokenIncreaseTo,
                          pendingTokenIncreaseTo: null,
                      }
                    : prev
            );
            alert("Extra token hold authorized.");
            return true;
        } catch (error) {
            console.error(error);
            alert("An error occurred");
            return false;
        } finally {
            setRsvpLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!user) return;
        if (!confirm("Cancel this RSVP? Tokens held will be refunded if RSVP is still open.")) return;
        setRsvpLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/member/rsvps", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ eventId: id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.error || "Could not cancel");
                return;
            }
            setMyRsvp(null);
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setRsvpLoading(false);
        }
    };

    if (authLoading || loading) {
        return <div className="p-8 text-center text-muted-foreground">Loading event...</div>;
    }
    if (!event) return <div className="p-8 text-center text-muted-foreground">Event not found</div>;
    if (event.category === "FEATURED_EVENTS" && event.slug) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                Redirecting to tournament registration…
            </div>
        );
    }
    if (event.category === "WEEKLY_SPORTS" && !user) {
        return <div className="p-8 text-center text-muted-foreground">Redirecting to login...</div>;
    }

    const windowState = weeklyRsvpWindow(event);
    const extraHold = Math.max(
        0,
        Number(myRsvp?.pendingTokenIncreaseTo || 0) - Number(myRsvp?.tokensHeld || 0)
    );
    const pendingAuth = extraHold > 0 && !weeklyOccurrenceStarted(event);
    const canCancelWeekly =
        event.category === "WEEKLY_SPORTS" && (windowState !== "closed" || pendingAuth);
    const rsvpDisabled = rsvpLoading || windowState === "before" || windowState === "closed";
    const tokenHold = weeklyTokenHoldAmounts(event);

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
                                className="rounded-sm border-transparent bg-[color:var(--mz-teal)] text-white"
                                variant="default"
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
                <div className="max-w-none whitespace-pre-wrap text-base leading-relaxed text-foreground/90 md:text-lg">
                    {event.description}
                </div>

                {/* Registration & Fees Box (Full Width) */}
                {event.category === "WEEKLY_SPORTS" ? (
                <Card className="overflow-hidden">
                    <CardContent className="flex flex-col gap-6 p-6 md:p-8">
                        <div className="w-full space-y-4">
                            <div className="text-center md:text-left">
                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6d00] dark:text-[#ffd700]">
                                    Token hold at RSVP
                                </p>
                                <p className="text-3xl font-extrabold text-[#1a3556] dark:text-white">
                                    {tokenHold.hold}{" "}
                                    <span className="text-lg font-medium text-muted-foreground dark:text-white/80">
                                        tokens held
                                    </span>
                                </p>
                                {tokenHold.hasRange ? (
                                    <p className="mt-1 text-sm text-muted-foreground dark:text-white/80">
                                        Final charge may be as low as{" "}
                                        <strong className="text-foreground dark:text-white">
                                            {tokenHold.leastCharge}
                                        </strong>{" "}
                                        if turnout is strong.
                                    </p>
                                ) : null}
                            </div>
                            <WeeklyTokenHoldExplainer event={event} />
                        </div>

                        <div className="w-full border-t pt-6 md:flex md:justify-end">
                            {myRsvp ? (
                                <div className="flex w-full flex-col gap-3 md:ml-auto md:max-w-md">
                                    {holdChangedNote ? (
                                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                                            {holdChangedNote}
                                        </div>
                                    ) : null}
                                    {pendingAuth ? (
                                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                                            <p className="font-semibold">Action required: extra token hold</p>
                                            <p className="mt-1">
                                                The hold increased to {myRsvp.pendingTokenIncreaseTo} tokens
                                                (you currently have {myRsvp.tokensHeld ?? 0} held). Authorize
                                                the extra {extraHold} even if your wallet already covers it.
                                                If you do not authorize before the event starts, your RSVP
                                                will be cancelled and the original hold refunded.
                                            </p>
                                        </div>
                                    ) : null}
                                    <Badge className="justify-center py-3 text-sm" variant="secondary">
                                        Already RSVP’d — {myRsvp.status === "WAITLISTED"
                                            ? `Waitlisted${myRsvp.waitlistPosition ? ` #${myRsvp.waitlistPosition}` : ""}`
                                            : "Confirmed"}
                                    </Badge>
                                    {pendingAuth ? (
                                        <RsvpTokenActions
                                            key={`auth-${myRsvp.pendingTokenIncreaseTo ?? 0}-${extraHold}`}
                                            eventId={id}
                                            tokensNeeded={extraHold}
                                            rsvpDisabled={rsvpLoading}
                                            rsvpLoading={rsvpLoading}
                                            onRsvp={handleAuthorizeIncrease}
                                            getAuthToken={async () => user?.getIdToken()}
                                            submitLabel={`Authorize extra ${extraHold} token${extraHold === 1 ? "" : "s"}`}
                                            ignoreAutoReplenish
                                        />
                                    ) : null}
                                    {canCancelWeekly ? (
                                        <Button
                                            variant="outline"
                                            className="h-12 w-full"
                                            disabled={rsvpLoading}
                                            onClick={() => void handleCancel()}
                                        >
                                            {rsvpLoading ? "Cancelling…" : "Cancel RSVP"}
                                        </Button>
                                    ) : (
                                        <p className="text-center text-xs text-muted-foreground dark:text-white/80">
                                            RSVP is closed. Contact an admin to cancel.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <RsvpTokenActions
                                    eventId={id}
                                    tokensNeeded={tokenHold.hold}
                                    rsvpDisabled={rsvpDisabled}
                                    rsvpLoading={rsvpLoading}
                                    onRsvp={handleRSVP}
                                    getAuthToken={async () => user?.getIdToken()}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
                ) : (
                <Card className="overflow-hidden">
                    <CardContent className="flex flex-col gap-4 p-6 md:p-8">
                        <p className="text-sm text-muted-foreground">
                            This featured event uses tournament registration, not weekly RSVP.
                        </p>
                        <Button
                            asChild
                            className="w-full bg-[#1a3556] font-semibold text-white hover:bg-[#122540] md:w-64 dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
                        >
                            <Link href="/events">Browse featured events</Link>
                        </Button>
                    </CardContent>
                </Card>
                )}
            </div>
        </div>
    );
}
