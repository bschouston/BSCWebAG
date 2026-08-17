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
        const { transactionId } = await request.json();

        if (!transactionId || typeof transactionId !== "string") {
            return NextResponse.json({ error: "Missing transactionId" }, { status: 400 });
        }

        const ref = adminDb.collection("token_transactions").doc(transactionId);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        const tx = snap.data() as Record<string, unknown>;
        const paymentIntentId =
            typeof tx.stripePaymentIntentId === "string" ? tx.stripePaymentIntentId : null;

        if (!paymentIntentId) {
            return NextResponse.json(
                { error: "No Stripe payment found for this transaction" },
                { status: 400 }
            );
        }

        if (tx.stripeRefundId || tx.stripeChargeStatus === "refunded") {
            return NextResponse.json(
                { error: "This charge has already been refunded" },
                { status: 400 }
            );
        }

        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
        });

        await ref.update({
            stripeRefundId: refund.id,
            stripeChargeStatus: "refunded",
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
        console.error("Token transaction refund error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
