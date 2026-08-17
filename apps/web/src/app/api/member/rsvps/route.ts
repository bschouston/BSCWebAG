import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";
import {
  ensureTokenBalance,
  resolveWeeklyTokenHold,
  topUpToMinThresholdIfNeeded,
  userHasValidCard,
} from "@/lib/token-autotopup";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  let body: { eventId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }

  try {
    // Pre-read event + user (outside txn) for card / auto top-up
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data()!;
    const { isWeekly, tokensMax } = resolveWeeklyTokenHold(event as {
      category?: string;
      tokensRequired?: number;
      tokensMin?: number | null;
      tokensMax?: number | null;
    });

    const userSnap = await adminDb.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const user = userSnap.data() as Record<string, unknown>;

    if (isWeekly) {
      if (!userHasValidCard(user)) {
        return NextResponse.json(
          {
            error: "A valid credit card on file is required to RSVP for weekly events",
            code: "CARD_REQUIRED",
          },
          { status: 402 }
        );
      }

      if (tokensMax > 0) {
        const topUp = await ensureTokenBalance({
          uid: userId,
          needed: tokensMax,
        });
        if (!topUp.ok) {
          return NextResponse.json(
            { error: topUp.error, code: topUp.code },
            { status: 402 }
          );
        }
      }
    }

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

      const eventData = eventDoc.data()!;
      const userData = userDoc.data()!;
      const hold = resolveWeeklyTokenHold(eventData as {
        category?: string;
        tokensRequired?: number;
        tokensMin?: number | null;
        tokensMax?: number | null;
      });

      const currentCount = eventData.confirmedCount || 0;
      const capacity = eventData.capacity || 0;
      let userBalance =
        typeof userData.tokenBalance === "number" ? userData.tokenBalance : 0;

      let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED";
      let waitlistPosition: number | null = null;

      if (currentCount >= capacity) {
        status = "WAITLISTED";
        waitlistPosition = (eventData.waitlistCount || 0) + 1;
      }

      if (hold.isWeekly && hold.tokensMax > 0 && userBalance < hold.tokensMax) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      // Non-weekly legacy: confirm-only debit of tokensRequired
      const legacyTokens = Number(eventData.tokensRequired) || 0;
      if (!hold.isWeekly && status === "CONFIRMED" && legacyTokens > 0 && userBalance < legacyTokens) {
        throw new Error("INSUFFICIENT_TOKENS");
      }

      const now = Timestamp.now();
      const rsvpPayload: Record<string, unknown> = {
        id: rsvpId,
        eventId,
        userId,
        status,
        waitlistPosition,
        attended: false,
        createdAt: now,
        updatedAt: now,
      };

      if (hold.isWeekly && hold.tokensMax > 0) {
        rsvpPayload.tokensHeld = hold.tokensMax;
        rsvpPayload.tokensFinal = null;
        rsvpPayload.tokensMin = hold.tokensMin;
        rsvpPayload.tokensMax = hold.tokensMax;
      }

      t.set(rsvpRef, rsvpPayload);

      if (status === "CONFIRMED") {
        t.update(eventRef, { confirmedCount: currentCount + 1 });
      } else {
        t.update(eventRef, { waitlistCount: (eventData.waitlistCount || 0) + 1 });
      }

      if (hold.isWeekly && hold.tokensMax > 0) {
        const ledger = await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: userBalance,
          type: "DEBIT",
          amount: hold.tokensMax,
          reason: "rsvp_hold",
          description: `RSVP hold (up to ${hold.tokensMax} tokens): ${eventData.title}`,
          idempotencyKey: `rsvp_hold_${rsvpId}`,
          eventId,
          rsvpId,
          meta: { tokensMin: hold.tokensMin, tokensMax: hold.tokensMax, status },
        });
        userBalance = ledger.balance;
      } else if (!hold.isWeekly && status === "CONFIRMED" && legacyTokens > 0) {
        await applyTokenLedgerInTransaction(t, adminDb, {
          userId,
          userRef,
          currentBalance: userBalance,
          type: "DEBIT",
          amount: legacyTokens,
          reason: "rsvp",
          description: `RSVP to ${eventData.title}`,
          idempotencyKey: `rsvp_debit_${rsvpId}`,
          eventId,
          rsvpId,
        });
      }

      return {
        status,
        waitlistPosition,
        tokensHeld: hold.isWeekly && hold.tokensMax > 0 ? hold.tokensMax : null,
      };
    });

    // After hold debit, refill to member min threshold if needed
    if (isWeekly) {
      await topUpToMinThresholdIfNeeded(userId).catch((e) =>
        console.error("post-RSVP threshold top-up:", e)
      );
    }

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
