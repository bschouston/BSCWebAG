import { NextResponse, NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const { error } = await requireSuperAdmin(request);
    if (error) return error;

    const adminDb = getAdminDb();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });

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

        // Retrieve the Stripe session to get the payment_intent ID
        const session = await stripe.checkout.sessions.retrieve(reg.receiptStripeSession);

        if (!session.payment_intent) {
            return NextResponse.json({ error: "No payment intent found on this Stripe session" }, { status: 400 });
        }

        const paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent.id;

        // Issue the refund via Stripe
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
        });

        // Update Firestore — keep receiptStripeSession intact to prevent re-payment
        await ref.update({
            paymentStatus: "refunded",
            stripeRefundId: refund.id,
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
