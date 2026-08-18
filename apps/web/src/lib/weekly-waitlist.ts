import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";
import { notifyWaitlistPromoted } from "@/lib/notify";

type WaitRow = {
  id: string;
  status?: string;
  waitlistPosition?: number | null;
  userId?: string;
};

function memberName(user: Record<string, unknown>) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadWaitlisted(adminDb: Firestore, eventId: string): Promise<WaitRow[]> {
  const snap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<WaitRow, "id">) }))
    .filter((d) => d.status === "WAITLISTED")
    .sort(
      (a, b) =>
        (typeof a.waitlistPosition === "number" ? a.waitlistPosition : 9999) -
        (typeof b.waitlistPosition === "number" ? b.waitlistPosition : 9999)
    );
}

async function reindexWaitlist(adminDb: Firestore, waitlisted: WaitRow[]) {
  let pos = 1;
  for (const row of waitlisted) {
    await adminDb.collection("event_rsvps").doc(row.id).update({ waitlistPosition: pos });
    pos += 1;
  }
}

export async function promoteWaitlistedToFillCapacity(
  adminDb: Firestore,
  eventId: string,
  slots: number
): Promise<number> {
  if (slots <= 0) return 0;
  let promoted = 0;
  for (let i = 0; i < slots; i += 1) {
    const waitlisted = await loadWaitlisted(adminDb, eventId);
    const next = waitlisted[0];
    if (!next) break;
    await adminDb.runTransaction(async (t) => {
      const eventRef = adminDb.collection("events").doc(eventId);
      const nextRef = adminDb.collection("event_rsvps").doc(next.id);
      const eventDoc = await t.get(eventRef);
      const nextDoc = await t.get(nextRef);
      if (!nextDoc.exists || nextDoc.data()?.status !== "WAITLISTED") return;
      t.update(nextRef, {
        status: "CONFIRMED",
        waitlistPosition: null,
        updatedAt: Timestamp.now(),
      });
      const ev = eventDoc.data() ?? {};
      t.update(eventRef, {
        confirmedCount: (ev.confirmedCount || 0) + 1,
        waitlistCount: Math.max(0, (ev.waitlistCount || 0) - 1),
      });
    });
    const rest = waitlisted.slice(1);
    await reindexWaitlist(adminDb, rest);
    promoted += 1;
    const uid = String(next.userId || "");
    if (uid) {
      const eventSnap = await adminDb.collection("events").doc(eventId).get();
      const event = eventSnap.data() ?? {};
      const u = await adminDb.collection("users").doc(uid).get();
      const ud = u.data() ?? {};
      if (typeof ud.email === "string") {
        const start = toDate(event.startTime);
        notifyWaitlistPromoted({
          to: ud.email,
          name: memberName(ud as Record<string, unknown>),
          eventTitle: String(event.title || "Weekly event"),
          startLabel: start
            ? start.toLocaleString("en-US", { timeZone: "America/Chicago" })
            : "",
        }).catch((e) => console.error("promote email", e));
      }
    }
  }
  return promoted;
}

export async function cancelWeeklyRsvpAndPromote(opts: {
  adminDb: Firestore;
  eventId: string;
  rsvpId: string;
  reason?: string;
}): Promise<{ ok: boolean; wasConfirmed: boolean }> {
  const { adminDb, eventId, rsvpId } = opts;
  const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
  const rsvpSnap = await rsvpRef.get();
  if (!rsvpSnap.exists) return { ok: false, wasConfirmed: false };
  const rsvp = rsvpSnap.data()!;
  if (rsvp.status !== "CONFIRMED" && rsvp.status !== "WAITLISTED") {
    return { ok: false, wasConfirmed: false };
  }

  const promoted = await adminDb.runTransaction(async (t) => {
    const eventRef = adminDb.collection("events").doc(eventId);
    const userId = String(rsvp.userId || "");
    const userRef = adminDb.collection("users").doc(userId);
    const [eventDoc, rsvpDoc, userDoc] = await Promise.all([
      t.get(eventRef),
      t.get(rsvpRef),
      t.get(userRef),
    ]);
    if (!rsvpDoc.exists) throw new Error("NOT_FOUND");
    const live = rsvpDoc.data()!;
    if (live.status !== "CONFIRMED" && live.status !== "WAITLISTED") {
      throw new Error("NOT_ACTIVE");
    }
    const eventData = eventDoc.data() ?? {};
    const userData = userDoc.data() ?? {};
    const held = Number(live.tokensHeld) || 0;
    let balance = typeof userData.tokenBalance === "number" ? userData.tokenBalance : 0;
    if (held > 0 && userId) {
      const credit = await applyTokenLedgerInTransaction(t, adminDb, {
        userId,
        userRef,
        currentBalance: balance,
        type: "CREDIT",
        amount: held,
        reason: "rsvp_cancel_refund",
        description: opts.reason || `Cancel RSVP refund: ${eventData.title}`,
        idempotencyKey: `rsvp_cancel_refund_${rsvpId}`,
        eventId,
        rsvpId,
      });
      balance = credit.balance;
    }
    t.update(rsvpRef, {
      status: "CANCELLED",
      waitlistPosition: null,
      pendingTokenIncreaseTo: null,
      updatedAt: Timestamp.now(),
      cancelledAt: FieldValue.serverTimestamp(),
    });
    if (live.status === "CONFIRMED") {
      t.update(eventRef, {
        confirmedCount: Math.max(0, (eventData.confirmedCount || 0) - 1),
      });
    } else {
      t.update(eventRef, {
        waitlistCount: Math.max(0, (eventData.waitlistCount || 0) - 1),
      });
    }
    return live.status === "CONFIRMED";
  });

  if (promoted) {
    await promoteWaitlistedToFillCapacity(adminDb, eventId, 1);
  }
  return { ok: true, wasConfirmed: promoted };
}
