import { getAdminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { RegistrationClientTable } from "./client-table";
import {
    registrationIsConfirmed,
    registrationIsWaitlisted,
    registrationIsVisibleOnRoster,
} from "@/lib/registration-status";

export default async function EventRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
    const adminDb = getAdminDb();
    const { id: eventId } = await params;

    // Fetch Event Details
    const eventDoc = await adminDb.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
        notFound();
    }
    const eventData = eventDoc.data();

    // Fetch Registrations
    const registrationsSnapshot = await adminDb
        .collection("events")
        .doc(eventId)
        .collection("event_registrations")
        .orderBy("registeredAt", "desc")
        .get();

    const registrations = registrationsSnapshot.docs
        .filter((doc) => !doc.data().isDraft)
        .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                registeredAt: data.registeredAt?.toDate?.()?.toISOString() || null,
            };
        })
        .filter((r) => registrationIsVisibleOnRoster(r as any));

    const confirmedCount = registrations.filter((r) => registrationIsConfirmed(r as any)).length;
    const waitlistCount = registrations.filter((r) => registrationIsWaitlisted(r as any)).length;

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <Button variant="outline" size="icon" asChild>
                            <Link href="/admin/events">
                                <ArrowLeft className="w-4 h-4" />
                            </Link>
                        </Button>
                        <h1 className="text-3xl font-bold tracking-tight">Registrations</h1>
                    </div>
                    <p className="text-muted-foreground ml-14">
                        {eventData?.title} — {confirmedCount} confirmed
                        {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}.
                    </p>
                </div>
                <Button variant="default">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Signup Roster</CardTitle>
                    <CardDescription>All participants who submitted the custom registration form.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RegistrationClientTable registrations={registrations} eventId={eventId} />
                </CardContent>
            </Card>
        </div>
    );
}
