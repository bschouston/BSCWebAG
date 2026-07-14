import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { getRegistrationForm } from "@/lib/registration-forms/server";
import { DynamicRegistrationForm } from "@/components/forms/dynamic-registration-form";
import { VolleyballRegistrationForm } from "@/components/forms/volleyball-registration";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ eventId?: string; edit?: string }>;
}

export default async function DynamicRegisterPage({ params, searchParams }: Props) {
  const { formId } = await params;
  const { eventId } = await searchParams;

  const form = await getRegistrationForm(formId);
  if (!form || form.status !== "ACTIVE") notFound();

  let registrationFee: number | undefined;
  let eventTitle: string | undefined;
  let registrationEndIso: string | undefined;
  let registrationsClosedAtIso: string | undefined;
  let registrationDeadline: string | undefined;

  if (eventId) {
    try {
      const snap = await getAdminDb().collection("events").doc(eventId).get();
      if (snap.exists) {
        const data = snap.data()!;
        const fee = data.registrationFees?.[0]?.amount;
        if (fee != null) registrationFee = Number(fee);
        if (data.title) eventTitle = String(data.title);
        if (data.registrationEnd?.toDate) {
          registrationEndIso = data.registrationEnd.toDate().toISOString();
        }
        if ((data as any).registrationsClosedAt?.toDate) {
          registrationsClosedAtIso = (data as any).registrationsClosedAt.toDate().toISOString();
        }
        if ((data as any).registrationDeadline) {
          registrationDeadline = String((data as any).registrationDeadline);
        }
      }
    } catch {
      // non-critical
    }
  }

  const useLegacyVolleyball = form.slug === "volleyball" || form.id === "volleyball";

  return (
    <div className="min-h-screen bg-muted/20 py-12 px-4 md:px-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <Suspense fallback={<div className="text-center p-8">Loading form...</div>}>
          {useLegacyVolleyball ? (
            <VolleyballRegistrationForm
              registrationFee={registrationFee}
              eventTitle={eventTitle}
              registrationEndIso={registrationEndIso}
              registrationsClosedAtIso={registrationsClosedAtIso}
              registrationDeadline={registrationDeadline}
            />
          ) : (
            <DynamicRegistrationForm
              formDef={{
                id: form.id,
                name: form.name,
                slug: form.slug,
                description: form.description,
                sections: form.sections,
                fields: form.fields,
              }}
              registrationFee={registrationFee}
              eventTitle={eventTitle}
              registrationEndIso={registrationEndIso}
              registrationsClosedAtIso={registrationsClosedAtIso}
              registrationDeadline={registrationDeadline}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
