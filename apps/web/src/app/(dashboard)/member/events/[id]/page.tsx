"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SportEvent } from "@/types";
import { ArrowLeft } from "lucide-react";
import { WeeklyEventRsvpConfirmedMark } from "@/components/events/weekly-event-rsvp-confirmed-mark";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { WeeklyTokenHoldExplainer } from "@/components/member/weekly-token-hold-explainer";
import { WeeklyEventTeamsShowcase } from "@/components/events/weekly-event-teams-showcase";
import { WeeklyEventWhenWhere } from "@/components/events/weekly-event-when-where";
import { WeeklyEventJumpNav } from "@/components/events/weekly-event-jump-nav";
import {
    WeeklyEventRsvpActions,
    useWeeklyEventRsvp,
} from "@/components/member/weekly-event-rsvp-card";
import { chicagoDateLabel, chicagoTimeRangeLabel } from "@/lib/weekly-rsvp";
import { weeklyTokenHoldAmounts } from "@/lib/weekly-tokens";
import { loginHref } from "@/lib/auth/return-url";
import { eventPagePath } from "@/lib/calendar-urls";
import {
    needsWeeklyRsvpAutoScroll,
    useSectionHashScroll,
} from "@/hooks/use-section-hash-scroll";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [event, setEvent] = useState<SportEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const {
        myRsvp,
        rsvpLoading,
        rsvpReady,
        holdChangedNote,
        handleRSVP,
        handleAuthorizeIncrease,
        handleCancel,
    } = useWeeklyEventRsvp(id, `/member/events/${id}#rsvp`);

    const loadEvent = useCallback(async () => {
        try {
            const eventRes = await fetch(`/api/events/${id}`);
            if (eventRes.ok) {
                setEvent(await eventRes.json());
            }
        } catch (error) {
            console.error("Failed to fetch event", error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (authLoading || loading || !event) return;
        if (event.category === "WEEKLY_SPORTS" && !user) {
            router.replace(loginHref(`/member/events/${id}#rsvp`));
            return;
        }
        if (event.category === "FEATURED_EVENTS" && event.slug) {
            router.replace(eventPagePath(event, { hash: null }));
        }
    }, [authLoading, loading, event, user, id, router]);

    useEffect(() => {
        void loadEvent();
    }, [loadEvent]);

    const scrollReady = !authLoading && !loading && Boolean(event) && rsvpReady;
    const allowRsvpScroll = !user || needsWeeklyRsvpAutoScroll(myRsvp);
    useSectionHashScroll({ ready: scrollReady, allowRsvpScroll });

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

    const tokenHold = weeklyTokenHoldAmounts(event);
    const timeLabel =
        event.category === "WEEKLY_SPORTS"
            ? chicagoTimeRangeLabel(event.startTime, event.endTime)
            : `${new Date(event.startTime as unknown as string).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${new Date(event.endTime as unknown as string).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
    const dateLabel =
        event.category === "WEEKLY_SPORTS"
            ? chicagoDateLabel(event.startTime)
            : new Date(event.startTime as unknown as string).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
              });
    const showTeams = event.category === "WEEKLY_SPORTS" && Boolean(event.teamsEnabled);

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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                            <h1 className="min-w-0 flex-1 text-4xl font-extrabold tracking-tight md:text-6xl">
                                {event.title}
                            </h1>
                            {event.category === "WEEKLY_SPORTS" && myRsvp?.status === "CONFIRMED" ? (
                                <WeeklyEventRsvpConfirmedMark />
                            ) : null}
                        </div>
                        <div className="mz-rule" />
                        {event.category === "WEEKLY_SPORTS" ? (
                            <WeeklyEventJumpNav
                                showTeams={showTeams}
                                showDescription={Boolean(event.description)}
                            />
                        ) : null}
                    </div>
                </div>

                <WeeklyEventWhenWhere
                    dateLabel={dateLabel}
                    timeLabel={timeLabel}
                    locationId={event.locationId}
                    addressUrl={event.addressUrl}
                />

                {event.description ? (
                    <section id="description" className="scroll-mt-28">
                        <Card className="overflow-hidden">
                            <CardContent className="space-y-4 p-6 md:p-8">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d00] dark:text-[#ffd700]">
                                    Description
                                </p>
                                <div className="max-w-none whitespace-pre-wrap text-base leading-relaxed text-foreground/90 md:text-lg">
                                    {event.description}
                                </div>
                            </CardContent>
                        </Card>
                    </section>
                ) : null}

                {showTeams ? (
                    <WeeklyEventTeamsShowcase
                        eventId={id}
                        allowJoin={myRsvp?.status === "CONFIRMED"}
                        rsvpStatus={myRsvp?.status ?? null}
                    />
                ) : null}

                {event.category === "WEEKLY_SPORTS" ? (
                <section id="rsvp" className="scroll-mt-28">
                <Card className="overflow-hidden">
                    <CardContent className="flex flex-col gap-6 p-6 md:p-8">
                        <div className="w-full space-y-4">
                            <div className="text-center md:text-left">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8a6d00] dark:text-[#ffd700]">
                                    Token hold
                                </p>
                                <h2 className="mt-1 text-3xl font-black tracking-tight text-[#1a3556] dark:text-white md:text-5xl">
                                    RSVP
                                </h2>
                                <p className="mt-3 text-3xl font-extrabold text-[#1a3556] dark:text-white">
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
                            <WeeklyEventRsvpActions
                                event={event}
                                myRsvp={myRsvp}
                                rsvpLoading={rsvpLoading}
                                holdChangedNote={holdChangedNote}
                                onRsvp={handleRSVP}
                                onAuthorizeIncrease={handleAuthorizeIncrease}
                                onCancel={handleCancel}
                            />
                        </div>
                    </CardContent>
                </Card>
                </section>
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
