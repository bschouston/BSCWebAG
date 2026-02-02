import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const decoded = await verifyAuth(request);
    if (!decoded) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.uid;
    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
        return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    try {
        const result = await adminDb.runTransaction(async (t) => {
            // 1. Get Event and User refs
            const eventRef = adminDb.collection("events").doc(eventId);
            const userRef = adminDb.collection("users").doc(userId);
            const rsvpRef = adminDb.collection("event_rsvps").doc(`${eventId}_${userId}`);

            // 2. Read current state
            const eventDoc = await t.get(eventRef);
            if (!eventDoc.exists) throw new Error("Event not found");

            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("User not found");

            const rsvpDoc = await t.get(rsvpRef);
            if (rsvpDoc.exists) {
                const rsvpData = rsvpDoc.data();
                if (rsvpData?.status === 'CONFIRMED' || rsvpData?.status === 'WAITLISTED') {
                    throw new Error("ALREADY_RSVPED");
                }
            }

            const event = eventDoc.data()!;
            const user = userDoc.data()!;

            // 3. Logic: Check Capacity
            // We need to count confirmed rsvps. 
            // NOTE: In a transaction, we can't do a query that depends on the transaction writes easily without aggregation.
            // Ideally we store 'confirmedCount' on the event document to keep it atomic.
            // For now, let's assume we maintain a counter or we just check the limit loosely? 
            // No, strict limit is required. Let's rely on reading the event doc which hopefully *should* have a 'confirmedCount' if we update it.
            // Since we don't have it yet, we would have to query. Queries in transactions must be ancestor queries or similar limitation in client SDK, but Admin SDK allows it?
            // Admin SDK allows queries in transactions but you must use the transaction object to get the query.

            // Let's implement a 'confirmedCount' on the event object for simpler atomic locking.
            // If it doesn't exist, we assume 0 (but we should backfill it).
            const currentCount = event.confirmedCount || 0;
            const capacity = event.capacity || 0;
            const tokensRequired = event.tokensRequired || 0;
            const userBalance = user.tokenBalance || 0;

            let status = "CONFIRMED";
            let waitlistPosition = null;

            if (currentCount >= capacity) {
                status = "WAITLISTED";
                // Get waitlist count? Or just increment a waitlist counter on event
                // Let's rely on waitlistCount on event too.
                const currentWaitlistCount = event.waitlistCount || 0;
                waitlistPosition = currentWaitlistCount + 1;
            } else {
                // Check tokens
                if (userBalance < tokensRequired) {
                    throw new Error("INSUFFICIENT_TOKENS");
                }
            }

            // 4. Writes
            const now = Timestamp.now();

            // Create/Update RSVP
            t.set(rsvpRef, {
                id: `${eventId}_${userId}`,
                eventId,
                userId,
                status,
                waitlistPosition,
                attended: false,
                createdAt: now,
                updatedAt: now
            });

            // Update Event Counters
            if (status === "CONFIRMED") {
                t.update(eventRef, { confirmedCount: currentCount + 1 });
            } else {
                t.update(eventRef, { waitlistCount: (event.waitlistCount || 0) + 1 });
            }

            // Deduct Tokens & Create Transaction Record if Confirmed
            if (status === "CONFIRMED" && tokensRequired > 0) {
                t.update(userRef, { tokenBalance: userBalance - tokensRequired });

                const transactionRef = adminDb.collection("token_transactions").doc();
                t.set(transactionRef, {
                    id: transactionRef.id,
                    userId,
                    type: "DEBIT",
                    amount: tokensRequired,
                    description: `RSVP to ${event.title}`,
                    eventId,
                    createdAt: now
                });
            }

            return { status, waitlistPosition };
        });

        return NextResponse.json({ success: true, ...result });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("RSVP Transaction Error:", error);
        if (error.message === "ALREADY_RSVPED") {
            return NextResponse.json({ error: "You have already RSVP'd to this event" }, { status: 409 });
        }
        if (error.message === "INSUFFICIENT_TOKENS") {
            return NextResponse.json({ error: "Insufficient tokens" }, { status: 402 });
        }
        return NextResponse.json({ error: error.message || "Failed to RSVP" }, { status: 500 });
    }
}
