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
        if (!registrationsMeta) {
            return NextResponse.json({ success: true });
        }

        const registrations: { eventId: string; registrationId: string }[] =
            JSON.parse(registrationsMeta);

        const amountPaid = (session.amount_total ?? 0) / 100;

        await Promise.all(
            registrations.map(async ({ eventId, registrationId }) => {
                const ref = adminDb
                    .collection("events")
                    .doc(eventId)
                    .collection("event_registrations")
                    .doc(registrationId);

                const [regSnap, eventSnap] = await Promise.all([
                    ref.get(),
                    adminDb.collection("events").doc(eventId).get(),
                ]);

                const reg = regSnap.data();
                const event = eventSnap.data();

                // Idempotency: if receipt was already sent for this session, skip everything
                if (reg?.receiptStripeSession === sessionId) {
                    return;
                }

                // Mark paid and stamp the session ID atomically
                await ref.update({
                    paymentStatus: "paid",
                    receiptStripeSession: sessionId,
                });

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
            })
        );

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Verification failed";
        console.error("Checkout verify error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
