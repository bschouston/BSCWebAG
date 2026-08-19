import { NextResponse, NextRequest } from "next/server";
import type { DocumentReference, Query } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { chicagoDayBounds, parseYmdParam } from "@/lib/ymd-range";
import { stripeModeFromLivemode, stripeModeFromObjectId, withStripeForPaymentIntent } from "@/lib/stripe-wallet";
import { descriptionsWithWeeklyEventSlug } from "@/lib/token-tx-weekly-description";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

export interface TokenTransactionRow {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    type: "CREDIT" | "DEBIT";
    amount: number;
    reason: string | null;
    description: string | null;
    balanceAfter: number | null;
    stripePaymentIntentId: string | null;
    stripeAmountPaid: number | null;
    stripeLivemode: boolean | null;
    stripeChargeStatus: string | null;
    stripeRefundId: string | null;
    refundable: boolean;
    createdAt: string | null;
}

function serializeCreatedAt(value: unknown): string | null {
    if (
        value &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (typeof value === "string") return value;
    return null;
}

function isRefundable(args: {
    stripePaymentIntentId: string | null;
    stripeRefundId: string | null;
    stripeChargeStatus: string | null;
}): boolean {
    if (!args.stripePaymentIntentId) return false;
    if (args.stripeRefundId) return false;
    const status = args.stripeChargeStatus;
    if (status === "refunded" || status === "canceled" || status === "cancelled") return false;
    if (status && !["paid", "succeeded", "processing", "requires_capture"].includes(status)) {
        return false;
    }
    return true;
}

async function hydrateStripe(
    ref: DocumentReference,
    data: Record<string, unknown>
): Promise<{
    stripeLivemode: boolean | null;
    stripeAmountPaid: number | null;
    stripeChargeStatus: string | null;
    stripeRefundId: string | null;
}> {
    const piId =
        typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    const existingRefundId =
        typeof data.stripeRefundId === "string" ? data.stripeRefundId : null;

    if (!piId) {
        return {
            stripeLivemode: null,
            stripeAmountPaid: null,
            stripeChargeStatus: null,
            stripeRefundId: existingRefundId,
        };
    }

    const cached =
        data.stripeLivemode !== undefined &&
        data.stripeAmountPaid !== undefined &&
        data.stripeChargeStatus !== undefined;

    if (cached) {
        return {
            stripeLivemode: Boolean(data.stripeLivemode),
            stripeAmountPaid:
                typeof data.stripeAmountPaid === "number" ? data.stripeAmountPaid : null,
            stripeChargeStatus:
                typeof data.stripeChargeStatus === "string" ? data.stripeChargeStatus : null,
            stripeRefundId: existingRefundId,
        };
    }

    try {
        const preferred =
            typeof data.stripeLivemode === "boolean"
                ? stripeModeFromLivemode(data.stripeLivemode)
                : stripeModeFromObjectId(piId);
        const { stripe, pi } = await withStripeForPaymentIntent(piId, preferred, async (stripe) => {
            const pi = await stripe.paymentIntents.retrieve(piId, {
                expand: ["latest_charge"],
            });
            return { stripe, pi };
        });
        const charge =
            typeof pi.latest_charge === "object" && pi.latest_charge !== null
                ? (pi.latest_charge as Stripe.Charge)
                : null;

        const livemode = pi.livemode;
        const amountPaid = (pi.amount_received || charge?.amount || pi.amount || 0) / 100;
        const refunded = Boolean(charge?.refunded) || (charge?.amount_refunded ?? 0) > 0;
        const stripeChargeStatus = refunded
            ? "refunded"
            : pi.status === "succeeded"
              ? "paid"
              : pi.status;

        let stripeRefundId = existingRefundId;
        if (refunded && !stripeRefundId) {
            const listed = await stripe.refunds.list({ payment_intent: piId, limit: 1 });
            stripeRefundId = listed.data[0]?.id ?? null;
        }

        await ref.update({
            stripeLivemode: livemode,
            stripeAmountPaid: amountPaid,
            stripeChargeStatus,
            ...(stripeRefundId ? { stripeRefundId } : {}),
        });

        return {
            stripeLivemode: livemode,
            stripeAmountPaid: amountPaid,
            stripeChargeStatus,
            stripeRefundId,
        };
    } catch (err) {
        console.warn(`Failed to hydrate Stripe PI ${piId}:`, err);
        return {
            stripeLivemode: typeof data.stripeLivemode === "boolean" ? data.stripeLivemode : null,
            stripeAmountPaid:
                typeof data.stripeAmountPaid === "number" ? data.stripeAmountPaid : null,
            stripeChargeStatus:
                typeof data.stripeChargeStatus === "string" ? data.stripeChargeStatus : null,
            stripeRefundId: existingRefundId,
        };
    }
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
    const cursor = searchParams.get("cursor");
    const { start, end } = chicagoDayBounds(
        parseYmdParam(searchParams.get("from")),
        parseYmdParam(searchParams.get("to"))
    );

    try {
        let query: Query = adminDb.collection("token_transactions").orderBy("createdAt", "desc");
        if (start) query = query.where("createdAt", ">=", Timestamp.fromDate(start));
        if (end) query = query.where("createdAt", "<=", Timestamp.fromDate(end));
        if (cursor) {
            const cursorDoc = await adminDb.collection("token_transactions").doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }
        query = query.limit(cap + 1);

        const snapshot = await query.get();
        const hasMore = snapshot.docs.length > cap;
        const pageDocs = hasMore ? snapshot.docs.slice(0, cap) : snapshot.docs;
        const nextCursor = hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null;

        const uids = [...new Set(pageDocs.map((doc) => String(doc.data().userId ?? "")).filter(Boolean))];
        const userMap: Record<
            string,
            { firstName: string; lastName: string; email: string }
        > = {};

        if (uids.length > 0) {
            const refs = uids.map((uid) => adminDb.collection("users").doc(uid));
            const userSnaps = await adminDb.getAll(...refs);
            for (const snap of userSnaps) {
                const d = snap.data() ?? {};
                userMap[snap.id] = {
                    firstName: typeof d.firstName === "string" ? d.firstName : "",
                    lastName: typeof d.lastName === "string" ? d.lastName : "",
                    email: typeof d.email === "string" ? d.email : "",
                };
            }
        }

        const descriptions = await descriptionsWithWeeklyEventSlug(
            adminDb,
            pageDocs.map((doc) => doc.data())
        );

        const transactions = await Promise.all(
            pageDocs.map(async (doc, i): Promise<TokenTransactionRow> => {
                const d = doc.data() as Record<string, unknown>;
                const userId = typeof d.userId === "string" ? d.userId : "";
                const stripeFields = await hydrateStripe(doc.ref, d);
                const stripePaymentIntentId =
                    typeof d.stripePaymentIntentId === "string" ? d.stripePaymentIntentId : null;
                const user = userMap[userId] ?? { firstName: "", lastName: "", email: "" };

                return {
                    id: doc.id,
                    userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    type: d.type === "DEBIT" ? "DEBIT" : "CREDIT",
                    amount: typeof d.amount === "number" ? d.amount : 0,
                    reason: typeof d.reason === "string" ? d.reason : null,
                    description: descriptions[i],
                    balanceAfter: typeof d.balanceAfter === "number" ? d.balanceAfter : null,
                    stripePaymentIntentId,
                    ...stripeFields,
                    refundable: isRefundable({
                        stripePaymentIntentId,
                        stripeRefundId: stripeFields.stripeRefundId,
                        stripeChargeStatus: stripeFields.stripeChargeStatus,
                    }),
                    createdAt: serializeCreatedAt(d.createdAt),
                };
            })
        );

        return NextResponse.json({ transactions, nextCursor });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch token transactions";
        console.error("Token transactions API error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
