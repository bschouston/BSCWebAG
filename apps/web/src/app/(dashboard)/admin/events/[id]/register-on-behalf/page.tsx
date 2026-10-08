import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { getRegistrationForm } from "@/lib/registration-forms/server";
import { DynamicRegistrationForm } from "@/components/forms/dynamic-registration-form";
import { VolleyballRegistrationForm } from "@/components/forms/volleyball-registration";
import { eventHasRegistrationFees, registrationFeeAmount } from "@/lib/registration-fee";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RegisterOnBehalfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const adminDb = getAdminDb();
  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) notFound();

  const eventData = eventSnap.data()!;
  const formId =
    typeof eventData.registrationFormId === "string" ? eventData.registrationFormId.trim() : "";

  if (!formId) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="text-destructive">
          This event has no registration form linked. Set a form on the event before registering on
          behalf.
        </p>
        <Button variant="outline" asChild>
          <Link href={`/admin/events/${eventId}/manage`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to manage
          </Link>
        </Button>
      </div>
    );
  }

  const form = await getRegistrationForm(formId);
  if (!form) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <p className="text-destructive">Linked registration form was not found.</p>
        <Button variant="outline" asChild>
          <Link href={`/admin/events/${eventId}/manage`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to manage
          </Link>
        </Button>
      </div>
    );
  }

  const eventHasFees = eventHasRegistrationFees(eventData.registrationFees);
  const fee = registrationFeeAmount(eventData.registrationFees);
  const eventTitle = typeof eventData.title === "string" ? eventData.title : undefined;
  let registrationEndIso: string | undefined;
  let registrationsClosedAtIso: string | undefined;
  let registrationDeadline: string | undefined;

  if (eventData.registrationEnd?.toDate) {
    registrationEndIso = eventData.registrationEnd.toDate().toISOString();
  }
  if ((eventData as any).registrationsClosedAt?.toDate) {
    registrationsClosedAtIso = (eventData as any).registrationsClosedAt.toDate().toISOString();
  }
  if ((eventData as any).registrationDeadline) {
    registrationDeadline = String((eventData as any).registrationDeadline);
  }

  const useLegacyVolleyball = form.slug === "volleyball" || form.id === "volleyball";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/events/${eventId}/manage`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Manage event
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/rsvps?eventId=${eventId}`}>Manage Registrations</Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a3556] dark:text-foreground">
          Register on behalf
        </h1>
        <p className="text-sm text-muted-foreground">
          Creates a new pending registration and emails the participant a payment link. Does not
          change existing registrations.
        </p>
      </div>

      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading form…</div>}>
        {useLegacyVolleyball ? (
          <VolleyballRegistrationForm
            adminProxy
            adminEventId={eventId}
            registrationFee={fee ?? undefined}
            eventTitle={eventTitle}
            registrationEndIso={registrationEndIso}
            registrationsClosedAtIso={registrationsClosedAtIso}
            registrationDeadline={registrationDeadline}
          />
        ) : (
          <DynamicRegistrationForm
            adminProxy
            adminEventId={eventId}
            formDef={{
              id: form.id,
              name: form.name,
              slug: form.slug,
              description: form.description,
              sections: form.sections,
              fields: form.fields,
            }}
            registrationFee={fee ?? undefined}
            eventHasFees={eventHasFees}
            eventTitle={eventTitle}
            registrationEndIso={registrationEndIso}
            registrationsClosedAtIso={registrationsClosedAtIso}
            registrationDeadline={registrationDeadline}
          />
        )}
      </Suspense>
    </div>
  );
}
