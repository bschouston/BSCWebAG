import { NextResponse, NextRequest } from "next/server";
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { chicagoDayBounds, parseYmdParam } from "@/lib/ymd-range";
import {
    paymentIntentIdFromSession,
    retrieveCheckoutSession,
    stripeModeFromLivemode,
    stripeModeFromObjectId,
    withStripeForPaymentIntent,
    type StripeMode,
} from "@/lib/stripe-wallet";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
const SCAN_BATCH = 100;
const SCAN_CAP = 800;
/** Limit parallel Stripe hydrations so fee lookups are not rate-limited. */
const HYDRATE_CONCURRENCY = 5;

export interface BillingTransaction {
    registrationId: string;
    eventId: string;
    eventTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    amountPaid: number;
    /** Stripe processing fee in USD (from balance transaction). */
    stripeFee: number | null;
    livemode: boolean;
    paymentStatus: string;
    stripeRefundId?: string;
    stripeSessionId: string;
    stripePaymentIntentId?: string;
    registeredAt: string | null;
}

function encodeCursor(eventId: string, registrationId: string) {
    return `${eventId}:${registrationId}`;
}

function decodeCursor(cursor: string | null): { eventId: string; registrationId: string } | null {
    if (!cursor) return null;
    const idx = cursor.indexOf(":");
    if (idx <= 0) return null;
    return { eventId: cursor.slice(0, idx), registrationId: cursor.slice(idx + 1) };
}

function registeredAtIso(value: unknown): string | null {
    if (
        value &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function registeredAtMs(value: unknown): number {
    const iso = registeredAtIso(value);
    return iso ? new Date(iso).getTime() : 0;
}

function isPaidRegistration(data: Record<string, unknown>): boolean {
    return typeof data.receiptStripeSession === "string" && data.receiptStripeSession.length > 0;
}

function inDateRange(data: Record<string, unknown>, start: Date | null, end: Date | null): boolean {
    if (!start && !end) return true;
    const ms = registeredAtMs(data.registeredAt);
    if (!ms) return false;
    if (start && ms < start.getTime()) return false;
    if (end && ms > end.getTime()) return false;
    return true;
}

function chargeFromSession(session: Stripe.Checkout.Session): Stripe.Charge | null {
    const pi = session.payment_intent;
    if (!pi || typeof pi === "string") return null;
    const charge = pi.latest_charge;
    if (!charge || typeof charge === "string") return null;
    return charge;
}

function feeUsdFromBalanceTransaction(
    bt: Stripe.BalanceTransaction | string | null | undefined
): number | null {
    if (!bt || typeof bt === "string") return null;
    if (typeof bt.fee === "number" && Number.isFinite(bt.fee)) return bt.fee / 100;
    if (Array.isArray(bt.fee_details) && bt.fee_details.length > 0) {
        const sum = bt.fee_details.reduce((acc, row) => acc + (row.amount ?? 0), 0);
        return sum / 100;
    }
    return null;
}

async function feeUsdFromCharge(
    charge: Stripe.Charge | null | undefined,
    stripe: Stripe
): Promise<number | null> {
    if (!charge) return null;

    let bt = charge.balance_transaction;
    if (typeof bt === "string") {
        try {
            bt = await stripe.balanceTransactions.retrieve(bt);
        } catch {
            bt = null;
        }
    }
    const fromExpanded = feeUsdFromBalanceTransaction(bt);
    if (fromExpanded != null) return fromExpanded;

    // Fresh charge retrieve — nested Checkout expand often leaves BT null (automatic_async).
    try {
        const fresh = await stripe.charges.retrieve(charge.id, {
            expand: ["balance_transaction"],
        });
        let freshBt = fresh.balance_transaction;
        if (typeof freshBt === "string") {
            freshBt = await stripe.balanceTransactions.retrieve(freshBt);
        }
        const fromFresh = feeUsdFromBalanceTransaction(freshBt);
        if (fromFresh != null) return fromFresh;
    } catch {
        /* continue */
    }

    // Last resort: list BTs sourced from this charge.
    try {
        const listed = await stripe.balanceTransactions.list({
            source: charge.id,
            limit: 5,
            type: "charge",
        });
        for (const row of listed.data) {
            const fee = feeUsdFromBalanceTransaction(row);
            if (fee != null) return fee;
        }
    } catch {
        /* ignore */
    }

    return null;
}

async function resolveChargeAndFee(
    stripe: Stripe,
    piId: string | null,
    sessionCharge: Stripe.Charge | null
): Promise<{ charge: Stripe.Charge | null; fee: number | null }> {
    let charge = sessionCharge;

    if ((!charge || !charge.balance_transaction) && piId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(piId, {
                expand: ["latest_charge.balance_transaction"],
            });
            const latest = pi.latest_charge;
            if (latest && typeof latest !== "string") charge = latest;
            else if (typeof latest === "string") {
                charge = await stripe.charges.retrieve(latest, {
                    expand: ["balance_transaction"],
                });
            }
        } catch {
            /* keep session charge */
        }
    }

    const fee = await feeUsdFromCharge(charge, stripe);
    return { charge, fee };
}

async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function hydrateRow(
    doc: QueryDocumentSnapshot,
    eventTitle: string
): Promise<BillingTransaction> {
    const d = doc.data();
    const eventId = doc.ref.parent.parent?.id ?? "";
    const sessionId = String(d.receiptStripeSession ?? "");
    const storedPi =
        typeof d.stripePaymentIntentId === "string" ? d.stripePaymentIntentId : "";
    let amountPaid: number = d.stripeAmountPaid ?? 0;
    let stripeFee: number | null =
        typeof d.stripeFee === "number" && Number.isFinite(d.stripeFee) ? d.stripeFee : null;
    let livemode: boolean = d.stripeLivemode ?? false;
    let paymentStatus: string = d.paymentStatus ?? "paid";
    let stripeRefundId: string | undefined = d.stripeRefundId;
    let stripePaymentIntentId = storedPi;

    const needsFee = stripeFee == null;
    const needsRefundSync = paymentStatus !== "refunded";
    const needsAmount = d.stripeAmountPaid === undefined;
    const needsStripe = Boolean(sessionId || storedPi) && (needsFee || needsRefundSync || needsAmount);

    if (needsStripe) {
        try {
            const preferred: StripeMode =
                typeof d.stripeLivemode === "boolean"
                    ? stripeModeFromLivemode(d.stripeLivemode)
                    : stripeModeFromObjectId(sessionId || storedPi);

            // Prefer PaymentIntent path when we only need the fee (cheaper + more reliable BT expand).
            if (needsFee && storedPi && !needsRefundSync && !needsAmount) {
                const fee = await withStripeForPaymentIntent(storedPi, preferred, async (stripe) => {
                    const { fee: resolved } = await resolveChargeAndFee(stripe, storedPi, null);
                    return resolved;
                });
                if (fee != null) {
                    stripeFee = fee;
                    if (d.stripeFee !== fee) await doc.ref.update({ stripeFee: fee });
                }
            } else if (sessionId) {
                const { stripe, session } = await retrieveCheckoutSession(sessionId, preferred);
                livemode = session.livemode;
                const piId = paymentIntentIdFromSession(session) || storedPi || null;
                if (piId) stripePaymentIntentId = piId;

                const sessionCharge = chargeFromSession(session);
                const { charge, fee } = await resolveChargeAndFee(stripe, piId, sessionCharge);
                if (fee != null) stripeFee = fee;

                const fullyRefunded = Boolean(charge?.refunded);
                if (fullyRefunded) {
                    paymentStatus = "refunded";
                    if (!stripeRefundId && piId) {
                        const listed = await stripe.refunds.list({ payment_intent: piId, limit: 1 });
                        stripeRefundId = listed.data[0]?.id;
                    }
                }

                const patch: Record<string, unknown> = {};
                if (d.stripeLivemode !== livemode) patch.stripeLivemode = livemode;
                if (d.stripeAmountPaid === undefined) {
                    amountPaid = (session.amount_total ?? 0) / 100;
                    patch.stripeAmountPaid = amountPaid;
                }
                if (piId && storedPi !== piId) patch.stripePaymentIntentId = piId;
                if (fee != null && d.stripeFee !== fee) patch.stripeFee = fee;
                if (fullyRefunded && d.paymentStatus !== "refunded") {
                    patch.paymentStatus = "refunded";
                    patch.refundedAt = new Date();
                }
                if (fullyRefunded && stripeRefundId && d.stripeRefundId !== stripeRefundId) {
                    patch.stripeRefundId = stripeRefundId;
                }
                if (Object.keys(patch).length > 0) {
                    await doc.ref.update(patch);
                }
            } else if (storedPi && needsFee) {
                const fee = await withStripeForPaymentIntent(storedPi, preferred, async (stripe) => {
                    const { fee: resolved } = await resolveChargeAndFee(stripe, storedPi, null);
                    return resolved;
                });
                if (fee != null) {
                    stripeFee = fee;
                    if (d.stripeFee !== fee) await doc.ref.update({ stripeFee: fee });
                }
            }
        } catch (err) {
            console.warn(`Failed to sync Stripe for registration ${doc.id}:`, err);
        }
    }

    return {
        registrationId: doc.id,
        eventId,
        eventTitle,
        firstName: d.firstName ?? "",
        lastName: d.lastName ?? "",
        email: d.email ?? "",
        amountPaid,
        stripeFee,
        livemode,
        paymentStatus,
        stripeRefundId,
        stripeSessionId: sessionId,
        stripePaymentIntentId: stripePaymentIntentId || undefined,
        registeredAt: registeredAtIso(d.registeredAt),
    };
}

async function loadEventTitles(
    adminDb: Firestore,
    eventIds: string[]
): Promise<Record<string, string>> {
    const eventMap: Record<string, string> = {};
    const unique = [...new Set(eventIds.filter(Boolean))];
    await Promise.all(
        unique.map(async (eventId) => {
            const snap = await adminDb.collection("events").doc(eventId).get();
            eventMap[eventId] = snap.exists
                ? ((snap.data() as { title?: string })?.title ?? "Unknown Event")
                : "Unknown Event";
        })
    );
    return eventMap;
}

export async function GET(request: NextRequest) {
    const { error } = await requireSuperAdmin(request);
    if (error) return error;

    const adminDb = getAdminDb();

    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get("limit") ?? "", 10);
    const cap = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), PAGE_MAX)
        : PAGE_DEFAULT;
    const cursor = decodeCursor(searchParams.get("cursor"));
    const { start, end } = chicagoDayBounds(
        parseYmdParam(searchParams.get("from")),
        parseYmdParam(searchParams.get("to"))
    );

    try {
        let paidDocs: QueryDocumentSnapshot[] = [];
        let nextCursor: string | null = null;

        try {
            let query: Query = adminDb
                .collectionGroup("event_registrations")
                .orderBy("registeredAt", "desc");
            if (start) query = query.where("registeredAt", ">=", Timestamp.fromDate(start));
            if (end) query = query.where("registeredAt", "<=", Timestamp.fromDate(end));

            let startAfterSnap: QueryDocumentSnapshot | null = null;
            if (cursor) {
                const cursorSnap = await adminDb
                    .collection("events")
                    .doc(cursor.eventId)
                    .collection("event_registrations")
                    .doc(cursor.registrationId)
                    .get();
                if (cursorSnap.exists) startAfterSnap = cursorSnap as QueryDocumentSnapshot;
            }

            const collected: QueryDocumentSnapshot[] = [];
            let scanned = 0;
            let lastSnap = startAfterSnap;

            while (collected.length < cap + 1 && scanned < SCAN_CAP) {
                let pageQuery = query;
                if (lastSnap) pageQuery = pageQuery.startAfter(lastSnap);
                const snap = await pageQuery.limit(SCAN_BATCH).get();
                if (snap.empty) break;
                for (const doc of snap.docs) {
                    lastSnap = doc;
                    scanned += 1;
                    if (!isPaidRegistration(doc.data() as Record<string, unknown>)) continue;
                    collected.push(doc);
                    if (collected.length === cap + 1) break;
                }
                if (snap.docs.length < SCAN_BATCH) break;
            }

            const hasMore = collected.length > cap;
            paidDocs = hasMore ? collected.slice(0, cap) : collected;
            const last = paidDocs[paidDocs.length - 1];
            nextCursor =
                hasMore && last
                    ? encodeCursor(last.ref.parent.parent?.id ?? "", last.id)
                    : null;
        } catch (indexErr) {
            console.warn("Billing collectionGroup index missing; paginating in memory", indexErr);
            const snapshot = await adminDb.collectionGroup("event_registrations").get();
            const allPaid = snapshot.docs
                .filter((doc) => {
                    const d = doc.data() as Record<string, unknown>;
                    return isPaidRegistration(d) && inDateRange(d, start, end);
                })
                .sort((a, b) => registeredAtMs(b.data().registeredAt) - registeredAtMs(a.data().registeredAt));

            let startIndex = 0;
            if (cursor) {
                const idx = allPaid.findIndex(
                    (doc) =>
                        doc.id === cursor.registrationId &&
                        (doc.ref.parent.parent?.id ?? "") === cursor.eventId
                );
                startIndex = idx >= 0 ? idx + 1 : 0;
            }
            paidDocs = allPaid.slice(startIndex, startIndex + cap);
            const last = paidDocs[paidDocs.length - 1];
            nextCursor =
                startIndex + paidDocs.length < allPaid.length && last
                    ? encodeCursor(last.ref.parent.parent?.id ?? "", last.id)
                    : null;
        }

        const eventIds = paidDocs.map((doc) => doc.ref.parent.parent?.id ?? "");
        const eventMap = await loadEventTitles(adminDb, eventIds);

        const transactions = await mapPool(paidDocs, HYDRATE_CONCURRENCY, (doc) => {
            const eventId = doc.ref.parent.parent?.id ?? "";
            return hydrateRow(doc, eventMap[eventId] ?? "Unknown Event");
        });

        return NextResponse.json({ transactions, nextCursor });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch billing data";
        console.error("Billing API error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
