import { NextResponse, NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export interface BillingTransaction {
    registrationId: string;
    eventId: string;
    eventTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    amountPaid: number;
    livemode: boolean;
    paymentStatus: string;
    stripeRefundId?: string;
    stripeSessionId: string;
    registeredAt: string | null;
}

export async function GET(request: NextRequest) {
    const { error } = await requireSuperAdmin(request);
    if (error) return error;

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });

    try {
        // Fetch all event_registrations that have been paid via Stripe
        const snapshot = await adminDb
            .collectionGroup("event_registrations")
            .get();

        const paidDocs = snapshot.docs.filter(doc => {
            const d = doc.data();
            return !!d.receiptStripeSession;
        });

        // Collect unique event IDs to batch-fetch event titles
        const eventIds = [...new Set(
            paidDocs.map(doc => doc.ref.parent.parent?.id).filter(Boolean) as string[]
        )];

        const eventMap: Record<string, string> = {};
        await Promise.all(
            eventIds.map(async (eventId) => {
                const snap = await adminDb.collection("events").doc(eventId).get();
                if (snap.exists) {
                    eventMap[eventId] = (snap.data() as any)?.title ?? "Unknown Event";
                }
            })
        );

        // Build transaction list, backfilling Stripe data for historical payments that lack cached fields
        const transactions = await Promise.all(
            paidDocs.map(async (doc): Promise<BillingTransaction | null> => {
                const d = doc.data();
                const registrationId = doc.id;
                const eventId = doc.ref.parent.parent?.id ?? "";

                let amountPaid: number = d.stripeAmountPaid ?? 0;
                let livemode: boolean = d.stripeLivemode ?? false;

                // Backfill from Stripe for historical registrations missing cached fields
                if (d.stripeLivemode === undefined || d.stripeAmountPaid === undefined) {
                    try {
                        const session = await stripe.checkout.sessions.retrieve(d.receiptStripeSession);
                        amountPaid = (session.amount_total ?? 0) / 100;
                        livemode = session.livemode;

                        // Cache for future requests
                        await doc.ref.update({
                            stripeLivemode: livemode,
                            stripeAmountPaid: amountPaid,
                        });
                    } catch (err) {
                        console.warn(`Failed to backfill Stripe data for session ${d.receiptStripeSession}:`, err);
                    }
                }

                const registeredAt = d.registeredAt?.toDate?.()?.toISOString()
                    ?? (d.registeredAt ? new Date(d.registeredAt).toISOString() : null);

                return {
                    registrationId,
                    eventId,
                    eventTitle: eventMap[eventId] ?? "Unknown Event",
                    firstName: d.firstName ?? "",
                    lastName: d.lastName ?? "",
                    email: d.email ?? "",
                    amountPaid,
                    livemode,
                    paymentStatus: d.paymentStatus ?? "paid",
                    stripeRefundId: d.stripeRefundId,
                    stripeSessionId: d.receiptStripeSession,
                    registeredAt,
                };
            })
        );

        const validTransactions = transactions.filter(Boolean) as BillingTransaction[];

        // Sort newest first
        validTransactions.sort((a, b) => {
            if (!a.registeredAt) return 1;
            if (!b.registeredAt) return -1;
            return new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime();
        });

        return NextResponse.json({ transactions: validTransactions });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch billing data";
        console.error("Billing API error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
