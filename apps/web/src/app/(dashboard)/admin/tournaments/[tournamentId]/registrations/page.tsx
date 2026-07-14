import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegistrationClientTable } from "@/app/(dashboard)/admin/events/[id]/registrations/client-table";
import {
  registrationIsConfirmed,
  registrationIsWaitlisted,
  registrationIsVisibleOnRoster,
} from "@/lib/registration-status";

export const dynamic = "force-dynamic";

export default async function TournamentRegistrationsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const adminDb = getAdminDb();
  const tournSnap = await adminDb.collection("tournaments").doc(tournamentId).get();
  if (!tournSnap.exists) notFound();

  const tournament = tournSnap.data() as { name?: string; eventId?: string };
  const eventId = typeof tournament.eventId === "string" ? tournament.eventId.trim() : "";

  if (!eventId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
          <CardDescription>
            This tournament is not linked to an event yet. Convert a featured event or set{" "}
            <code className="text-xs">eventId</code> on the tournament to manage registrations here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/tournaments">Back to tournaments</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  const eventTitle = eventDoc.exists ? String(eventDoc.data()?.title ?? "Event") : "Linked event";

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
    .filter((r) => registrationIsVisibleOnRoster(r as Record<string, unknown>));

  const confirmedCount = registrations.filter((r) =>
    registrationIsConfirmed(r as Record<string, unknown>)
  ).length;
  const waitlistCount = registrations.filter((r) =>
    registrationIsWaitlisted(r as Record<string, unknown>)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Registrations</h2>
          <p className="text-sm text-muted-foreground">
            {eventTitle} — {confirmedCount} confirmed
            {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/events/${eventId}/registrations`}>Open full roster page</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/rsvps`}>Manage all registrations</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signup roster</CardTitle>
          <CardDescription>
            Submissions for the linked event (stored on the event, not the tournament).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrationClientTable registrations={registrations} eventId={eventId} />
        </CardContent>
      </Card>
    </div>
  );
}
