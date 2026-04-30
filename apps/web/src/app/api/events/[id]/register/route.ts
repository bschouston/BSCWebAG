import { NextResponse, NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { sendRegistrationConfirmation } from "@/lib/email";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminDb = getAdminDb();
        const { id: eventId } = await params;
        const registrationId = req.nextUrl.searchParams.get("registrationId");

        if (!eventId || !registrationId) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const snap = await adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .doc(registrationId)
            .get();

        if (!snap.exists) {
            return NextResponse.json({ error: "Registration not found" }, { status: 404 });
        }

        const data = snap.data()!;
        // Strip server-only or payment fields — only return form-fillable fields
        const { paymentStatus, receiptStripeSession, stripeSubscriptionId,
                stripeLivemode, stripeAmountPaid, registeredAt, ...formFields } = data;

        return NextResponse.json({ id: snap.id, ...formFields });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminDb = getAdminDb();
        const { id: eventId } = await params;
        const body = await req.json();

        if (!eventId) {
            return NextResponse.json({ error: "Missing Event ID" }, { status: 400 });
        }

        const eventSnap = await adminDb.collection("events").doc(eventId).get();
        const eventData = eventSnap.data() as any;
        if (!eventSnap.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        // Admin hard-close: no new registrations allowed
        if (eventData?.registrationsClosedAt) {
            return NextResponse.json(
                { error: "Registrations are closed for this event." },
                { status: 403 }
            );
        }

        const now = Timestamp.now();
        const regEnd: Timestamp | null =
            eventData?.registrationEnd ?? null;
        const isAfterEnd =
            !!regEnd && regEnd.toMillis() <= now.toMillis();

        const isUpdate = !!body.registrationId;

        // Only set status on initial creation. Updates (photo upload, edits) should not overwrite it.
        const baseRegistrationData: Record<string, unknown> = {
            ...body,
            registeredAt: FieldValue.serverTimestamp(),
        };

        if (!isUpdate) {
            baseRegistrationData.status = isAfterEnd ? "WAITLISTED" : "CONFIRMED";
            if (isAfterEnd) baseRegistrationData.waitlistedAt = now;
        }

        let docRef;
        if (body.registrationId) {
            docRef = adminDb.collection("events").doc(eventId).collection("event_registrations").doc(body.registrationId);
            // Ownership check: verify the email on the existing record matches before allowing updates
            const existingSnap = await docRef.get();
            if (existingSnap.exists) {
                const existingEmail = existingSnap.data()?.email;
                if (existingEmail && body.email && existingEmail !== body.email) {
                    return NextResponse.json({ error: "Forbidden: email mismatch" }, { status: 403 });
                }
            }
            await docRef.set(baseRegistrationData, { merge: true });
        } else {
            docRef = await adminDb
                .collection("events")
                .doc(eventId)
                .collection("event_registrations")
                .add(baseRegistrationData);
        }

        const registrationId = docRef.id;

        // Send confirmation email only for non-draft registrations.
        // Drafts are payment-pending — the webhook sends the email after payment succeeds.
        if (body.email && !body.registrationId && !body.isDraft) {
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
                registrationDetails: body,
            }).catch(err => console.error("Failed to send registration confirmation email:", err));
        }

        return NextResponse.json({
            success: true,
            id: registrationId,
            status: !isUpdate ? (isAfterEnd ? "WAITLISTED" : "CONFIRMED") : undefined,
        });

    } catch (error: any) {
        console.error("Error creating registration:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save registration" },
            { status: 500 }
        );
    }
}
