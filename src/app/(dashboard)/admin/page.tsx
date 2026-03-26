"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, ClipboardList, Loader2 } from "lucide-react";
import Link from "next/link";

interface DashboardStats {
    totalUsers: number;
    activeEvents: number;
    pendingRegistrations: number;
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            if (!user) return;
            try {
                const token = await user.getIdToken();
                const [usersRes, eventsRes] = await Promise.all([
                    fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
                    fetch("/api/events", { headers: { Authorization: `Bearer ${token}` } }),
                ]);

                const usersData = usersRes.ok ? await usersRes.json() : [];
                const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };

                const now = new Date();
                const activeEvents = (eventsData.events ?? []).filter(
                    (e: any) => e.status === "PUBLISHED" && new Date(e.endTime) >= now
                ).length;

                setStats({
                    totalUsers: Array.isArray(usersData) ? usersData.length : 0,
                    activeEvents,
                    pendingRegistrations: 0,
                });
            } catch (err) {
                console.error("Failed to load admin stats:", err);
            } finally {
                setLoadingStats(false);
            }
        }
        fetchStats();
    }, [user]);

    const statValue = (v: number | undefined) =>
        loadingStats ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
            <span>{v ?? "--"}</span>
        );

    return (
        <div className="container p-8">
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground mb-8">
                Welcome back{user?.displayName ? `, ${user.displayName}` : ""}.
            </p>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statValue(stats?.totalUsers)}</div>
                        <p className="text-xs text-muted-foreground">Registered accounts</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Events</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{statValue(stats?.activeEvents)}</div>
                        <p className="text-xs text-muted-foreground">Currently published & upcoming</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Manage Registrations</CardTitle>
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            <Link href="/admin/rsvps" className="text-primary hover:underline text-base font-medium">
                                View all &rarr;
                            </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">Registration &amp; payment status</p>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-8">
                <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
                <div className="flex gap-4 flex-wrap">
                    <Button asChild>
                        <Link href="/admin/events/new">Create Event</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/admin/events">Manage Events</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/admin/rsvps">Manage Registrations</Link>
                    </Button>
                    <Button variant="secondary" asChild>
                        <Link href="/admin/news">Manage News</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
