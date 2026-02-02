"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SportEvent } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AdminRSVPsPage() {
    const { user } = useAuth();
    const [events, setEvents] = useState<SportEvent[]>([]);
    const [selectedEventId, setSelectedEventId] = useState<string>("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rsvps, setRsvps] = useState<any[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [loadingRsvps, setLoadingRsvps] = useState(false);

    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch("/api/events?limit=50");
                const data = await res.json();
                setEvents(data.events || []);
                if (data.events?.length > 0) {
                    setSelectedEventId(data.events[0].id);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoadingEvents(false);
            }
        }
        fetchEvents();
    }, []);

    useEffect(() => {
        async function fetchRSVPs() {
            if (!selectedEventId || !user) return;
            setLoadingRsvps(true);
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/admin/rsvps?eventId=${selectedEventId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setRsvps(data.rsvps || []);
            } catch (error) {
                console.error(error);
            } finally {
                setLoadingRsvps(false);
            }
        }
        fetchRSVPs();
    }, [selectedEventId, user]);

    const selectedEvent = events.find(e => e.id === selectedEventId);
    const currentSport = selectedEvent?.sportId || "";

    const getSkillLevel = (user: any) => {
        if (!user || !user.skillLevels) return "N/A";
        // Try exact match case-insensitive or default
        // The profile stores keys like "Badminton" (capitalized from list)
        // ensure we match correctly.
        // Actually earlier ProfilePage saved them as "Badminton" etc.
        // And sportId is likely "badminton".
        // Let's try to match loosely.
        const skill = Object.entries(user.skillLevels).find(([key]) => key.toLowerCase() === currentSport.toLowerCase());
        return skill ? skill[1] : "-";
    };

    return (
        <div className="container p-8">
            <h1 className="text-3xl font-bold mb-8">Manage RSVPs</h1>

            <div className="flex items-center gap-4 mb-8">
                <div className="w-[300px]">
                    <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Event" />
                        </SelectTrigger>
                        <SelectContent>
                            {events.map(e => (
                                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => setSelectedEventId(selectedEventId)}>
                    Refresh
                </Button>
            </div>

            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Skill Level ({currentSport})</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Waitlist Pos</TableHead>
                            <TableHead>Attended</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingRsvps ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
                            </TableRow>
                        ) : rsvps.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No RSVPs for this event.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rsvps.map((rsvp) => (
                                <TableRow key={rsvp.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={rsvp.user?.photoURL} />
                                                <AvatarFallback>{rsvp.user?.firstName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {rsvp.user ? `${rsvp.user.firstName} ${rsvp.user.lastName}` : "Unknown User"}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{rsvp.user?.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{String(getSkillLevel(rsvp.user))}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={rsvp.status === 'CONFIRMED' ? 'default' : 'secondary'}>
                                            {rsvp.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{rsvp.waitlistPosition || "-"}</TableCell>
                                    <TableCell>{rsvp.attended ? "Yes" : "No"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant="ghost">Toggle Attendance</Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
