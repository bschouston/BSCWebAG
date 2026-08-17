import { NextResponse, NextRequest } from "next/server";
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { chicagoDayBounds, parseYmdParam } from "@/lib/ymd-range";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
const SCAN_BATCH = 100;
const SCAN_CAP = 800;

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

async function hydrateRow(
    stripe: Stripe,
    doc: QueryDocumentSnapshot,
    eventTitle: string
): Promise<BillingTransaction> {
    const d = doc.data();
    const eventId = doc.ref.parent.parent?.id ?? "";
    let amountPaid: number = d.stripeAmountPaid ?? 0;
    let livemode: boolean = d.stripeLivemode ?? false;

    if (d.stripeLivemode === undefined || d.stripeAmountPaid === undefined) {
        try {
            const session = await stripe.checkout.sessions.retrieve(d.receiptStripeSession);
            amountPaid = (session.amount_total ?? 0) / 100;
            livemode = session.livemode;
            await doc.ref.update({
                stripeLivemode: livemode,
                stripeAmountPaid: amountPaid,
            });
        } catch (err) {
            console.warn(`Failed to backfill Stripe data for session ${d.receiptStripeSession}:`, err);
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
        livemode,
        paymentStatus: d.paymentStatus ?? "paid",
        stripeRefundId: d.stripeRefundId,
        stripeSessionId: d.receiptStripeSession,
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
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });

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

        const transactions = await Promise.all(
            paidDocs.map((doc) => {
                const eventId = doc.ref.parent.parent?.id ?? "";
                return hydrateRow(stripe, doc, eventMap[eventId] ?? "Unknown Event");
            })
        );

        return NextResponse.json({ transactions, nextCursor });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch billing data";
        console.error("Billing API error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
