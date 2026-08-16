import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  const body = await request.json();
  const { eventId } = body;

  if (!eventId) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }

  try {
    const result = await adminDb.runTransaction(async (t) => {
      const eventRef = adminDb.collection("events").doc(eventId);
      const userRef = adminDb.collection("users").doc(userId);
      const rsvpId = `${eventId}_${userId}`;
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);

      const eventDoc = await t.get(eventRef);
      if (!eventDoc.exists) throw new Error("Event not found");

      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User not found");

      const rsvpDoc = await t.get(rsvpRef);
      if (rsvpDoc.exists) {
        const rsvpData = rsvpDoc.data();
        if (rsvpData?.status === "CONFIRMED" || rsvpData?.status === "WAITLISTED") {
          throw new Error("ALREADY_RSVPED");
        }
      }

      const event = eventDoc.data()!;
      const user = userDoc.data()!;

      const currentCount = event.confirmedCount || 0;
      const capacity = event.capacity || 0;
      const tokensRequired = event.tokensRequired || 0;
      const userBalance =
        typeof user.tokenBalance === "number" ? user.tokenBalance : 0;

      let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED";
      let waitlistPosition: number | null = null;

      if (currentCount >= capacity) {
        status = "WAITLISTED";
        waitlistPosition = (event.waitlistCount || 0) + 1;
      } else if (tokensRequired > 0 && userBalance < tokensRequired) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      const now = Timestamp.now();

      t.set(rsvpRef, {
        id: rsvpId,
        eventId,
        userId,
        status,
        waitlistPosition,
        attended: false,
        createdAt: now,
        updatedAt: now,
      });

      if (status === "CONFIRMED") {
        t.update(eventRef, { confirmedCount: currentCount + 1 });
      } else {
        t.update(eventRef, { waitlistCount: (event.waitlistCount || 0) + 1 });
      }

      // Phase 1: debit on confirm only (escrow for waitlist comes in Phase 3)
      if (status === "CONFIRMED" && tokensRequired > 0) {
        await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: userBalance,
          type: "DEBIT",
          amount: tokensRequired,
          reason: "rsvp",
          description: `RSVP to ${event.title}`,
          idempotencyKey: `rsvp_debit_${rsvpId}`,
          eventId,
          rsvpId,
        });
      }

      return { status, waitlistPosition };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("RSVP Transaction Error:", error);
    if (message === "ALREADY_RSVPED") {
      return NextResponse.json(
        { error: "You have already RSVP'd to this event" },
        { status: 409 }
      );
    }
    if (message === "INSUFFICIENT_TOKENS" || message === "NEGATIVE_BALANCE") {
      return NextResponse.json({ error: "Insufficient tokens" }, { status: 402 });
    }
    return NextResponse.json({ error: message || "Failed to RSVP" }, { status: 500 });
  }
}
