import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> } // In Next 15 this is a Promise
) {
    try {
        const { id: eventId } = await params;
        const body = await req.json();

        if (!eventId) {
            return NextResponse.json({ error: "Missing Event ID" }, { status: 400 });
        }

        const registrationData = {
            ...body,
            registeredAt: FieldValue.serverTimestamp(), // override string to use Firestore timestamp
        };

        let docRef;
        if (body.registrationId) {
            // Registration update
            docRef = adminDb.collection("events").doc(eventId).collection("event_registrations").doc(body.registrationId);
            await docRef.set(registrationData, { merge: true });
        } else {
            // New registration
            docRef = await adminDb
                .collection("events")
                .doc(eventId)
                .collection("event_registrations")
                .add(registrationData);
        }

        return NextResponse.json({ success: true, id: docRef.id });

    } catch (error: any) {
        console.error("Error creating registration:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save registration" },
            { status: 500 }
        );
    }
}
