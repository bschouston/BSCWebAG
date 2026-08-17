"use client";

import { EventForm } from "@/components/admin/event-form";
import { WeeklyOccurrenceActions } from "@/components/admin/weekly-occurrence-actions";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EditEventPage() {
    const params = useParams();
    const id = params.id as string;
    const { user } = useAuth();
    const [event, setEvent] = useState<SportEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [ending, setEnding] = useState(false);
    const [endError, setEndError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchEvent() {
            if (!id) return;
            try {
                const res = await fetch(`/api/events/${id}`);
                const data = await res.json();
                setEvent(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }
        fetchEvent();
    }, [id]);

    if (loading) return <div className="p-8">Loading event...</div>;
    if (!event) return <div className="p-8">Event not found</div>;

    const isWeekly = event.category === "WEEKLY_SPORTS";

    const endRegistrations = async () => {
        setEnding(true);
        setEndError(null);
        try {
            const token = await user?.getIdToken();
            const res = await fetch(`/api/admin/events/${id}/registrations/end`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? "Failed to end registrations");
            setEvent((prev) =>
                prev
                    ? {
                          ...prev,
                          registrationsClosedAt: new Date().toISOString() as unknown as SportEvent["registrationsClosedAt"],
                      }
                    : prev
            );
        } catch (e: unknown) {
            setEndError(e instanceof Error ? e.message : "Failed to end registrations");
        } finally {
            setEnding(false);
        }
    };

    return (
        <div className="container p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{isWeekly ? "Edit this week" : "Edit Event"}</h1>
                    {isWeekly ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            Changes here apply to this occurrence only. RSVP’d members are emailed if the start time moves.
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Link href="/admin/events/calendar">
                        <Button variant="outline">Calendar</Button>
                    </Link>
                    {!isWeekly ? (
                        <Button
                            variant="destructive"
                            onClick={endRegistrations}
                            disabled={ending || Boolean(event.registrationsClosedAt)}
                        >
                            {event.registrationsClosedAt
                                ? "Registrations ended"
                                : ending
                                  ? "Ending…"
                                  : "End registrations"}
                        </Button>
                    ) : null}
                    {endError && <p className="text-sm text-destructive">{endError}</p>}
                </div>
            </div>
            {isWeekly ? (
                <WeeklyOccurrenceActions
                    eventId={id}
                    event={event}
                    onEventChange={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
                />
            ) : null}
            <EventForm initialData={event} isid={id} />
        </div>
    );
}
