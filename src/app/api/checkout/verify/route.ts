import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";

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

        // Parse registration IDs embedded at checkout creation time
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
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Verification failed";
        console.error("Checkout verify error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
