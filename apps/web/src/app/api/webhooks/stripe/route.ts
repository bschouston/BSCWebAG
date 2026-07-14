import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { syncRegistrationToTournament } from "@/lib/registration-tournament-sync";
import { sendPaymentReceipt, sendInstallmentUpdate, sendRegistrationConfirmation } from "@/lib/email";
import {
    appendVolleyballRegistrationRow,
    isGoogleSheetsConfigured,
} from "@/lib/google-sheets";
import { shouldSyncRegistrationToGoogleSheet } from "@/lib/registration-forms/google-sheet-sync";

export const dynamic = "force-dynamic";
// App Router reads the raw body via request.text() / request.arrayBuffer() —
// no bodyParser config needed (that was Pages Router only).

const TOTAL_INSTALLMENTS = 3;

async function syncRegistrationAfterPayment(
    eventId: string,
    registrationId: string
) {
    const adminDb = getAdminDb();
    const ref = adminDb
        .collection("events")
        .doc(eventId)
        .collection("event_registrations")
        .doc(registrationId);
    const snap = await ref.get();
    if (!snap.exists) return;
    await syncRegistrationToTournament(adminDb, eventId, registrationId, snap.data() as Record<string, unknown>);
}

/** Parse and validate the registrations JSON from Stripe metadata. */
function parseRegistrations(
    meta: string | undefined | null
): { eventId: string; registrationId: string }[] | null {
    if (!meta) return null;
    try {
        return JSON.parse(meta);
    } catch {
        return null;
    }
}

async function shouldSyncVolleyballToSheet(
    eventDoc: Record<string, unknown> | undefined
): Promise<boolean> {
    return (
        isGoogleSheetsConfigured() &&
        (await shouldSyncRegistrationToGoogleSheet(eventDoc))
    );
}

export async function POST(request: NextRequest) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });
    const adminDb = getAdminDb();

    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET is not set");
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    if (!signature) {
        return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Webhook signature verification failed";
        console.error("Stripe webhook error:", message);
        return NextResponse.json({ error: message }, { status: 400 });
    }

    // ── checkout.session.completed ───────────────────────────────────────────
    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        const registrations = parseRegistrations(session.metadata?.registrations);
        if (!registrations) {
            return NextResponse.json({ received: true });
        }

        const sessionId = session.id;
        const isSubscription = session.mode === "subscription";
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
                const eventDoc = eventSnap.data();

                if (!reg) return;

                const eventTitle = eventDoc?.title ?? "the event";

                // Idempotency: skip main processing if already processed for this session
                if (reg.receiptStripeSession === sessionId) {
                    // Stripe may retry; if Firestore updated but Google Sheets failed, retry append only
                    if (
                        (await shouldSyncVolleyballToSheet(eventDoc)) &&
                        !reg.googleSheetsSyncedAt
                    ) {
                        try {
                            await appendVolleyballRegistrationRow({
                                reg: reg as Record<string, unknown>,
                                eventId,
                                registrationId,
                                eventTitle,
                                amountPaid,
                                stripeSessionId: sessionId,
                            });
                            await ref.update({
                                googleSheetsSyncedAt: FieldValue.serverTimestamp(),
                            });
                        } catch (err) {
                            console.error("Google Sheets sync retry failed:", err);
                        }
                    }
                    return;
                }

                const wasDraft = reg.isDraft === true;
                const name = [reg.firstName, reg.lastName].filter(Boolean).join(" ") || "Participant";

                const tryVolleyballSheet = async (
                    merged: Record<string, unknown>
                ): Promise<boolean> => {
                    if (!(await shouldSyncVolleyballToSheet(eventDoc))) return true;
                    try {
                        await appendVolleyballRegistrationRow({
                            reg: merged,
                            eventId,
                            registrationId,
                            eventTitle,
                            amountPaid,
                            stripeSessionId: sessionId,
                        });
                        return true;
                    } catch (err) {
                        console.error("Google Sheets sync failed:", err);
                        return false;
                    }
                };

                if (isSubscription) {
                    // First installment — mark as partial and promote from draft
                    const subscriptionId =
                        typeof session.subscription === "string"
                            ? session.subscription
                            : (session.subscription as { id?: string })?.id ?? null;

                    const paymentUpdate = {
                        isDraft: false,
                        status: "CONFIRMED",
                        paymentStatus: "partial",
                        paymentType: "installment",
                        installmentsPaid: 1,
                        totalInstallments: TOTAL_INSTALLMENTS,
                        stripeSubscriptionId: subscriptionId,
                        receiptStripeSession: sessionId,
                        stripeLivemode: session.livemode,
                        stripeAmountPaid: amountPaid,
                    };

                    const mergedReg = { ...reg, ...paymentUpdate };
                    const sheetOk = await tryVolleyballSheet(mergedReg);

                    await ref.update({
                        ...paymentUpdate,
                        ...(sheetOk ? { googleSheetsSyncedAt: FieldValue.serverTimestamp() } : {}),
                    });
                    await syncRegistrationAfterPayment(eventId, registrationId);

                    if (!reg.email) return;

                    // For drafts: send registration confirmation first, then installment receipt
                    if (wasDraft) {
                        sendRegistrationConfirmation({
                            to: reg.email,
                            name,
                            eventTitle,
                            eventId,
                            registrationId,
                            amount: eventDoc?.registrationFees?.[0]?.amount
                                ? Number(eventDoc.registrationFees[0].amount)
                                : undefined,
                            registrationDetails: reg,
                        }).catch((err) =>
                            console.error("Failed to send registration confirmation email:", err)
                        );
                    }

                    sendInstallmentUpdate({
                        to: reg.email,
                        name,
                        eventTitle,
                        installmentNumber: 1,
                        totalInstallments: TOTAL_INSTALLMENTS,
                        amountPaid,
                        registrationId,
                    }).catch((err) => console.error("Failed to send installment email:", err));
                } else {
                    // One-time full payment
                    if (session.payment_status !== "paid") return;

                    const paymentUpdate = {
                        isDraft: false,
                        status: "CONFIRMED",
                        paymentStatus: "paid",
                        paymentType: "full",
                        receiptStripeSession: sessionId,
                        stripeLivemode: session.livemode,
                        stripeAmountPaid: amountPaid,
                    };

                    const mergedReg = { ...reg, ...paymentUpdate };
                    const sheetOk = await tryVolleyballSheet(mergedReg);

                    await ref.update({
                        ...paymentUpdate,
                        ...(sheetOk ? { googleSheetsSyncedAt: FieldValue.serverTimestamp() } : {}),
                    });
                    await syncRegistrationAfterPayment(eventId, registrationId);

                    if (!reg.email) return;

                    // For drafts: send registration confirmation first, then payment receipt
                    if (wasDraft) {
                        sendRegistrationConfirmation({
                            to: reg.email,
                            name,
                            eventTitle,
                            eventId,
                            registrationId,
                            amount: eventDoc?.registrationFees?.[0]?.amount
                                ? Number(eventDoc.registrationFees[0].amount)
                                : undefined,
                            registrationDetails: reg,
                        }).catch((err) =>
                            console.error("Failed to send registration confirmation email:", err)
                        );
                    }

                    sendPaymentReceipt({
                        to: reg.email,
                        name,
                        eventTitle,
                        amountPaid,
                        registrationId,
                    }).catch((err) => console.error("Failed to send payment receipt email:", err));
                }
            })
        );
    }

    // ── invoice.payment_succeeded — subsequent installments ──────────────────
    if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };

        // Only handle subscription invoices (not one-off payment invoices)
        const subscriptionId =
            typeof invoice.subscription === "string" ? invoice.subscription : null;

        if (!subscriptionId) {
            return NextResponse.json({ received: true });
        }

        // Retrieve the subscription to get registration metadata
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const paymentType = subscription.metadata?.paymentType;

        if (paymentType !== "installment") {
            return NextResponse.json({ received: true });
        }

        const registrations = parseRegistrations(subscription.metadata?.registrations);
        if (!registrations) {
            return NextResponse.json({ received: true });
        }

        const invoiceAmountPaid = (invoice.amount_paid ?? 0) / 100;
        const invoiceId = invoice.id;

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
                const eventDoc = eventSnap.data();

                if (!reg) return;

                // Idempotency: skip if this invoice was already processed
                if (reg.lastProcessedInvoice === invoiceId) return;

                // Skip if this is the very first invoice (handled by checkout.session.completed above)
                const currentInstallments = reg.installmentsPaid ?? 0;
                if (currentInstallments === 0) return;

                const newInstallmentCount = currentInstallments + 1;
                const isFullyPaid = newInstallmentCount >= TOTAL_INSTALLMENTS;

                await ref.update({
                    installmentsPaid: newInstallmentCount,
                    paymentStatus: isFullyPaid ? "paid" : "partial",
                    ...(isFullyPaid ? { status: "CONFIRMED" } : {}),
                    lastProcessedInvoice: invoiceId,
                    stripeAmountPaid: (reg.stripeAmountPaid ?? 0) + invoiceAmountPaid,
                });

                if (isFullyPaid) {
                    await syncRegistrationAfterPayment(eventId, registrationId);
                }

                // Cancel the subscription once all installments are paid
                if (isFullyPaid) {
                    try {
                        await stripe.subscriptions.cancel(subscriptionId);
                    } catch (err) {
                        console.error("Failed to cancel subscription after final installment:", err);
                    }
                }

                if (!reg.email) return;
                const name = [reg.firstName, reg.lastName].filter(Boolean).join(" ") || "Participant";
                const eventTitle = eventDoc?.title ?? "the event";

                sendInstallmentUpdate({
                    to: reg.email,
                    name,
                    eventTitle,
                    installmentNumber: newInstallmentCount,
                    totalInstallments: TOTAL_INSTALLMENTS,
                    amountPaid: invoiceAmountPaid,
                    registrationId,
                }).catch((err) => console.error("Failed to send installment update email:", err));
            })
        );
    }

    // Return 200 quickly so Stripe doesn't retry
    return NextResponse.json({ received: true });
}
