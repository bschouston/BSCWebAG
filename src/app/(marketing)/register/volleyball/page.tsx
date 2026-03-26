import { VolleyballRegistrationForm } from "@/components/forms/volleyball-registration";
import { adminDb } from "@/lib/firebase/admin";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
    searchParams: Promise<{ eventId?: string; edit?: string }>;
}

export default async function VolleyballRegistrationPage({ searchParams }: Props) {
    const { eventId } = await searchParams;

    let registrationFee: number | undefined;
    let eventTitle: string | undefined;

    if (eventId) {
        try {
            const snap = await adminDb.collection("events").doc(eventId).get();
            if (snap.exists) {
                const data = snap.data()!;
                const fee = data.registrationFees?.[0]?.amount;
                if (fee != null) registrationFee = Number(fee);
                if (data.title) eventTitle = String(data.title);
            }
        } catch {
            // Non-critical — form still works, just won't show fee until loaded
        }
    }

    return (
        <div className="min-h-screen bg-muted/20 py-12 px-4 md:px-0">
            <div className="max-w-4xl mx-auto space-y-6">
                <Suspense fallback={<div className="text-center p-8">Loading form...</div>}>
                    <VolleyballRegistrationForm
                        registrationFee={registrationFee}
                        eventTitle={eventTitle}
                    />
                </Suspense>
            </div>
        </div>
    );
}
