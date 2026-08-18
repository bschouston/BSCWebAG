import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";
import {
  buildInsufficientTokensPayload,
  purchaseExactTokensAtRsvp,
  purchasePackageAtRsvp,
} from "@/lib/token-autoreplenish";
import { BILLING_FROZEN_MESSAGE, isBillingFrozen } from "@/lib/billing-freeze";

export const dynamic = "force-dynamic";

function holdChangedResponse(pendingTo: number, held: number) {
  const extraHold = Math.max(0, pendingTo - held);
  return NextResponse.json(
    {
      error:
        extraHold > 0
          ? "The token hold changed. Review the updated amount to authorize."
          : "The extra token hold is no longer required.",
      code: "HOLD_CHANGED",
      pendingTokenIncreaseTo: extraHold > 0 ? pendingTo : null,
      tokensHeld: held,
      extraHold,
    },
    { status: 409 }
  );
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { eventId?: unknown; purchase?: unknown; expectedPendingTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }
  const expectedPendingTo =
    body.expectedPendingTo == null ? null : Number(body.expectedPendingTo);
  if (expectedPendingTo != null && (!Number.isFinite(expectedPendingTo) || expectedPendingTo < 0)) {
    return NextResponse.json({ error: "Invalid expectedPendingTo" }, { status: 400 });
  }

  type PurchasePayload = { mode: "unit"; tokenCount: number } | { mode: "package"; packageId: string };
  let purchase: PurchasePayload | null = null;
  if (body.purchase && typeof body.purchase === "object" && body.purchase !== null) {
    const p = body.purchase as Record<string, unknown>;
    if (p.mode === "unit") {
      const tokenCount = Number(p.tokenCount);
      if (!Number.isInteger(tokenCount) || tokenCount <= 0) {
        return NextResponse.json({ error: "Invalid tokenCount for unit purchase" }, { status: 400 });
      }
      purchase = { mode: "unit", tokenCount };
    } else if (p.mode === "package") {
      const packageId = typeof p.packageId === "string" ? p.packageId : "";
      if (!packageId) {
        return NextResponse.json({ error: "packageId required for package purchase" }, { status: 400 });
      }
      purchase = { mode: "package", packageId };
    }
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  const rsvpId = `${eventId}_${userId}`;

  try {
    const [eventSnap, rsvpSnap, userSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).get(),
      adminDb.collection("event_rsvps").doc(rsvpId).get(),
      adminDb.collection("users").doc(userId).get(),
    ]);
    if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (!rsvpSnap.exists) return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
    const event = eventSnap.data()!;
    const rsvp = rsvpSnap.data()!;
    const user = (userSnap.data() ?? {}) as Record<string, unknown>;
    if (event.category !== "WEEKLY_SPORTS") {
      return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
    }
    const status = rsvp.status;
    if (status !== "CONFIRMED" && status !== "WAITLISTED") {
      return NextResponse.json({ error: "No active RSVP" }, { status: 400 });
    }
    const start = event.startTime?.toDate?.() as Date | undefined;
    if (start && start.getTime() <= Date.now()) {
      return NextResponse.json({ error: "The event has already started" }, { status: 403 });
    }
    const pendingTo = Number(rsvp.pendingTokenIncreaseTo) || 0;
    const held = Number(rsvp.tokensHeld) || 0;
    const needed = pendingTo - held;
    if (
      expectedPendingTo != null &&
      (expectedPendingTo !== pendingTo || needed <= 0)
    ) {
      return holdChangedResponse(pendingTo, held);
    }
    if (needed <= 0) {
      return NextResponse.json({ error: "No token increase to authorize" }, { status: 400 });
    }
    if (isBillingFrozen(user)) {
      return NextResponse.json({ error: BILLING_FROZEN_MESSAGE, code: "BILLING_FROZEN" }, { status: 403 });
    }

    let balance = typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
    const eventTitle = String(event.title || "Weekly event");
    if (balance < needed) {
      if (purchase?.mode === "unit") {
        const bought = await purchaseExactTokensAtRsvp({
          uid: userId,
          tokenCount: purchase.tokenCount,
          eventId,
          eventTitle,
        });
        if (!bought.ok) {
          return NextResponse.json({ error: bought.error, code: bought.code, balance: bought.balance }, { status: 402 });
        }
        balance = bought.balance;
      } else if (purchase?.mode === "package") {
        const bought = await purchasePackageAtRsvp({
          uid: userId,
          packageId: purchase.packageId,
          eventId,
          eventTitle,
        });
        if (!bought.ok) {
          return NextResponse.json({ error: bought.error, code: bought.code, balance: bought.balance }, { status: 402 });
        }
        balance = bought.balance;
      } else {
        const payload = await buildInsufficientTokensPayload(userId, needed);
        return NextResponse.json(
          { error: "Authorize the extra hold — extra tokens are required", ...payload, code: "INSUFFICIENT_TOKENS" },
          { status: 402 }
        );
      }
    }
    if (balance < needed) {
      const payload = await buildInsufficientTokensPayload(userId, needed);
      return NextResponse.json({ error: "Insufficient tokens after purchase", ...payload }, { status: 402 });
    }

    await adminDb.runTransaction(async (t) => {
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
      const userRef = adminDb.collection("users").doc(userId);
      const [liveRsvp, liveUser] = await Promise.all([t.get(rsvpRef), t.get(userRef)]);
      if (!liveRsvp.exists) throw new Error("NOT_FOUND");
      const live = liveRsvp.data()!;
      const stillPending = Number(live.pendingTokenIncreaseTo) || 0;
      const stillHeld = Number(live.tokensHeld) || 0;
      if (expectedPendingTo != null && expectedPendingTo !== stillPending) {
        throw new Error(`HOLD_CHANGED:${stillPending}:${stillHeld}`);
      }
      const delta = stillPending - stillHeld;
      if (delta <= 0) {
        if (expectedPendingTo != null) {
          throw new Error(`HOLD_CHANGED:${stillPending}:${stillHeld}`);
        }
        return;
      }
      let current = typeof liveUser.data()?.tokenBalance === "number" ? liveUser.data()!.tokenBalance : 0;
      const debit = await applyTokenLedgerInTransaction(t, adminDb, {
        userId,
        userRef,
        currentBalance: current,
        type: "DEBIT",
        amount: delta,
        reason: "rsvp_hold",
        description: `Authorize extra hold: ${eventTitle}`,
        idempotencyKey: `rsvp_hold_increase_${rsvpId}_${stillPending}`,
        eventId,
        rsvpId,
      });
      current = debit.balance;
      t.update(rsvpRef, {
        tokensHeld: stillPending,
        tokensMax: stillPending,
        pendingTokenIncreaseTo: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
    });

    return NextResponse.json({ ok: true, tokensHeld: pendingTo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "HOLD_CHANGED" || message.startsWith("HOLD_CHANGED:")) {
      const parts = message.split(":");
      return holdChangedResponse(Number(parts[1]) || 0, Number(parts[2]) || 0);
    }
    console.error("authorize increase", err);
    return NextResponse.json({ error: "Could not authorize token increase" }, { status: 500 });
  }
}
