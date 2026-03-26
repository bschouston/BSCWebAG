import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";
import { sendPaymentReceipt } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });
    try {
        const { sessionId } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return NextResponse.json({ success: false, status: session.payment_status });
        }

        const registrationsMeta = session.metadata?.registrations;
        if (registrationsMeta) {
            const registrations: { eventId: string; registrationId: string }[] =
                JSON.parse(registrationsMeta);

            await Promise.all(
                registrations.map(({ eventId, registrationId }) =>
                    adminDb
                        .collection("events")
                        .doc(eventId)
                        .collection("event_registrations")
                        .doc(registrationId)
                        .update({ paymentStatus: "paid" })
                )
            );

            // Send payment receipt emails (fire-and-forget)
            const amountPaid = (session.amount_total ?? 0) / 100;

            for (const { eventId, registrationId } of registrations) {
                Promise.all([
                    adminDb.collection("events").doc(eventId).collection("event_registrations").doc(registrationId).get(),
                    adminDb.collection("events").doc(eventId).get(),
                ]).then(([regSnap, eventSnap]) => {
                    const reg = regSnap.data();
                    const event = eventSnap.data();
                    if (!reg?.email) return;

                    const name = [reg.firstName, reg.lastName].filter(Boolean).join(" ") || "Participant";
                    const eventTitle = event?.title ?? "the event";

                    sendPaymentReceipt({
                        to: reg.email,
                        name,
                        eventTitle,
                        amountPaid,
                        registrationId,
                    }).catch(err => console.error("Failed to send payment receipt email:", err));
                }).catch(err => console.error("Failed to fetch registration for receipt:", err));
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Verification failed";
        console.error("Checkout verify error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
