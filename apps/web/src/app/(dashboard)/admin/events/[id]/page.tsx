"use client";

import { EventForm } from "@/components/admin/event-form";
import { SportEvent } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EditEventPage() {
    const params = useParams();
    const id = params.id as string;
    const [event, setEvent] = useState<SportEvent | null>(null);
    const [loading, setLoading] = useState(true);

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
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link href={`/admin/events/${id}/manage`}>
                        <Button>Manage</Button>
                    </Link>
                    <Link href="/admin/events">
                        <Button variant="outline">All events</Button>
                    </Link>
                    <Link href="/admin/events/calendar">
                        <Button variant="outline">Calendar</Button>
                    </Link>
                </div>
            </div>
            <EventForm initialData={event} isid={id} />
        </div>
    );
}
