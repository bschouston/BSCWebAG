import { NextResponse, NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import {
    paymentIntentIdFromSession,
    retrieveCheckoutSession,
    stripeModeFromLivemode,
    stripeModeFromObjectId,
} from "@/lib/stripe-wallet";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const { error } = await requireSuperAdmin(request);
    if (error) return error;

    const adminDb = getAdminDb();

    try {
        const { eventId, registrationId } = await request.json();

        if (!eventId || !registrationId) {
            return NextResponse.json({ error: "Missing eventId or registrationId" }, { status: 400 });
        }

        const ref = adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .doc(registrationId);

        const regSnap = await ref.get();
        if (!regSnap.exists) {
            return NextResponse.json({ error: "Registration not found" }, { status: 404 });
        }

        const reg = regSnap.data() as Record<string, any>;

        if (!reg.receiptStripeSession) {
            return NextResponse.json({ error: "No Stripe payment found for this registration" }, { status: 400 });
        }

        if (reg.paymentStatus === "refunded") {
            return NextResponse.json({ error: "This registration has already been refunded" }, { status: 400 });
        }
        // partially_refunded is allowed — Stripe refunds the remaining balance when amount is omitted.

        const sessionId = String(reg.receiptStripeSession);
        const preferred =
            typeof reg.stripeLivemode === "boolean"
                ? stripeModeFromLivemode(reg.stripeLivemode)
                : stripeModeFromObjectId(sessionId);
        const { stripe, session } = await retrieveCheckoutSession(sessionId, preferred);
        const paymentIntentId = paymentIntentIdFromSession(session);

        if (!paymentIntentId) {
            return NextResponse.json({ error: "No payment intent found on this Stripe session" }, { status: 400 });
        }

        // Issue the refund via Stripe
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
        });

        // Update Firestore — keep receiptStripeSession intact to prevent re-payment
        await ref.update({
            paymentStatus: "refunded",
            stripeRefundId: refund.id,
            stripePaymentIntentId: paymentIntentId,
            refundedAt: new Date(),
        });

        return NextResponse.json({
            success: true,
            refundId: refund.id,
            status: refund.status,
            amount: (refund.amount ?? 0) / 100,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Refund failed";
        console.error("Billing refund error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
