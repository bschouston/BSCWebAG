"use client";

import { EventForm } from "@/components/admin/event-form";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

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
            setEvent((prev) => (prev ? ({ ...(prev as any), registrationsClosedAt: new Date().toISOString() } as any) : prev));
        } catch (e: any) {
            setEndError(e?.message ?? "Failed to end registrations");
        } finally {
            setEnding(false);
        }
    };

    return (
        <div className="container p-8">
            <div className="flex items-center justify-between gap-4 mb-8">
                <h1 className="text-3xl font-bold">Edit Event</h1>
                <div className="flex flex-col items-end gap-2">
                    <Button
                        variant="destructive"
                        onClick={endRegistrations}
                        disabled={ending || (event as any)?.registrationsClosedAt}
                    >
                        {(event as any)?.registrationsClosedAt
                            ? "Registrations ended"
                            : ending
                              ? "Ending…"
                              : "End registrations"}
                    </Button>
                    {endError && <p className="text-sm text-destructive">{endError}</p>}
                </div>
            </div>
            <EventForm initialData={event} isid={id} />
        </div>
    );
}
