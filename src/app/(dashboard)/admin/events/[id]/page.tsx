"use client";

import { EventForm } from "@/components/admin/event-form";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function EditEventPage() {
    const params = useParams();
    const id = params.id as string;
    const { user } = useAuth();
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

    return (
        <div className="container p-8">
            <h1 className="text-3xl font-bold mb-8">Edit Event</h1>
            <EventForm initialData={event} isid={id} />
        </div>
    );
}
