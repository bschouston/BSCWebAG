import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendRegistrationConfirmation } from "@/lib/email";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: eventId } = await params;
        const body = await req.json();

        if (!eventId) {
            return NextResponse.json({ error: "Missing Event ID" }, { status: 400 });
        }

        const registrationData = {
            ...body,
            registeredAt: FieldValue.serverTimestamp(),
        };

        let docRef;
        if (body.registrationId) {
            docRef = adminDb.collection("events").doc(eventId).collection("event_registrations").doc(body.registrationId);
            await docRef.set(registrationData, { merge: true });
        } else {
            docRef = await adminDb
                .collection("events")
                .doc(eventId)
                .collection("event_registrations")
                .add(registrationData);
        }

        const registrationId = docRef.id;

        // Send confirmation email (fire-and-forget — don't block the response)
        if (body.email && !body.registrationId) {
            const eventSnap = await adminDb.collection("events").doc(eventId).get();
            const eventData = eventSnap.data();
            const eventTitle = eventData?.title ?? "the event";
            const amount = eventData?.registrationFees?.[0]?.amount
                ? Number(eventData.registrationFees[0].amount)
                : undefined;
            const name = [body.firstName, body.lastName].filter(Boolean).join(" ") || "Participant";

            sendRegistrationConfirmation({
                to: body.email,
                name,
                eventTitle,
                eventId,
                registrationId,
                amount,
            }).catch(err => console.error("Failed to send registration confirmation email:", err));
        }

        return NextResponse.json({ success: true, id: registrationId });

    } catch (error: any) {
        console.error("Error creating registration:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save registration" },
            { status: 500 }
        );
    }
}
