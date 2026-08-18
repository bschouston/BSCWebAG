import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { applyTokenLedgerChange } from "@/lib/token-ledger";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { notifyWeeklySettle } from "@/lib/notify";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function memberName(user: Record<string, unknown>) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

/**
 * Admin finalize / cancel-all / no-show / RSVP override for a weekly occurrence.
 * body.action: finalize | cancel_event | no_show | set_rsvp_override
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;
  const { id: eventId } = await params;

  let body: {
    action?: unknown;
    confirmedCount?: unknown;
    targetRsvpId?: unknown;
    noShowMode?: unknown;
    extraTokens?: unknown;
    rsvpManualOverride?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action || "");
  const adminDb = getAdminDb();
  const eventRef = adminDb.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventSnap.data()!;
  if (event.category !== "WEEKLY_SPORTS") {
    return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
  }

  if (action === "set_rsvp_override") {
    const raw = body.rsvpManualOverride;
    const override =
      raw === "open" || raw === "closed" ? raw : raw === null || raw === "auto" || raw === "" ? null : undefined;
    if (override === undefined) {
      return NextResponse.json({ error: "rsvpManualOverride must be open, closed, or null" }, { status: 400 });
    }
    await eventRef.update({
      rsvpManualOverride: override,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: `event:${eventId}`,
      action: "weekly.rsvp_override",
      meta: { eventId, rsvpManualOverride: override },
    });
    return NextResponse.json({ ok: true, rsvpManualOverride: override });
  }

  const rsvpsSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();

  try {
    if (action === "finalize") {
      const confirmed = rsvpsSnap.docs.filter((d) => d.data().status === "CONFIRMED");
      const waitlisted = rsvpsSnap.docs.filter((d) => d.data().status === "WAITLISTED");
      const n =
        typeof body.confirmedCount === "number"
          ? body.confirmedCount
          : confirmed.length;
      const tokensFinal = computeTokensFinal({
        confirmedCount: n,
        minCapacity: Number(event.minCapacity) || 1,
        maxCapacity: Number(event.capacity) || 1,
        tokensMin: Number(event.tokensMin) || 0,
        tokensMax: Number(event.tokensMax) || 0,
      });

      for (const doc of confirmed) {
        const data = doc.data();
        const held = Number(data.tokensHeld) || 0;
        const refund = Math.max(0, held - tokensFinal);
        const uid = String(data.userId || "");
        if (refund > 0 && uid) {
          const credit = await applyTokenLedgerChange(adminDb, {
            userId: uid,
            type: "CREDIT",
            amount: refund,
            reason: "rsvp_settle_refund",
            description: `Settle refund: ${event.title}`,
            idempotencyKey: `rsvp_settle_refund_${doc.id}`,
            eventId,
            rsvpId: doc.id,
            adminUid: user.uid,
          });
          await doc.ref.update({ tokensFinal, updatedAt: FieldValue.serverTimestamp() });
          const u = await adminDb.collection("users").doc(uid).get();
          const ud = u.data() ?? {};
          if (typeof ud.email === "string") {
            notifyWeeklySettle({
              to: ud.email,
              name: memberName(ud as Record<string, unknown>),
              eventTitle: String(event.title || ""),
              tokensHeld: held,
              tokensFinal,
              refunded: refund,
              balanceAfter: credit.balance,
            }).catch((e) => console.error("settle email", e));
          }
        } else {
          await doc.ref.update({ tokensFinal, updatedAt: FieldValue.serverTimestamp() });
        }
      }

      for (const doc of waitlisted) {
        const data = doc.data();
        const held = Number(data.tokensHeld) || 0;
        const uid = String(data.userId || "");
        if (held > 0 && uid) {
          await applyTokenLedgerChange(adminDb, {
            userId: uid,
            type: "CREDIT",
            amount: held,
            reason: "rsvp_cancel_refund",
            description: `Waitlist release: ${event.title}`,
            idempotencyKey: `rsvp_waitlist_release_${doc.id}`,
            eventId,
            rsvpId: doc.id,
            adminUid: user.uid,
          });
        }
        await doc.ref.update({
          status: "CANCELLED",
          tokensFinal: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await eventRef.update({
        tokensSettledAt: FieldValue.serverTimestamp(),
        tokensFinal,
        status: "COMPLETED",
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.finalize",
        meta: { eventId, tokensFinal, confirmed: n },
      });
      return NextResponse.json({ ok: true, tokensFinal });
    }

    if (action === "cancel_event") {
      for (const doc of rsvpsSnap.docs) {
        const data = doc.data();
        if (data.status !== "CONFIRMED" && data.status !== "WAITLISTED") continue;
        const held = Number(data.tokensHeld) || 0;
        const uid = String(data.userId || "");
        if (held > 0 && uid) {
          await applyTokenLedgerChange(adminDb, {
            userId: uid,
            type: "CREDIT",
            amount: held,
            reason: "rsvp_cancel_refund",
            description: `Event cancelled: ${event.title}`,
            idempotencyKey: `rsvp_cancel_event_${doc.id}`,
            eventId,
            rsvpId: doc.id,
            adminUid: user.uid,
          });
        }
        await doc.ref.update({
          status: "CANCELLED",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await eventRef.update({
        status: "CANCELLED",
        confirmedCount: 0,
        waitlistCount: 0,
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.cancel_event",
        meta: { eventId },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "no_show") {
      const rsvpId = String(body.targetRsvpId || "");
      if (!rsvpId) {
        return NextResponse.json({ error: "targetRsvpId required" }, { status: 400 });
      }
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
      const rsvpSnap = await rsvpRef.get();
      if (!rsvpSnap.exists || rsvpSnap.data()?.eventId !== eventId) {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      const rsvp = rsvpSnap.data()!;
      const uid = String(rsvp.userId || "");
      const held = Number(rsvp.tokensHeld) || 0;
      const mode = String(body.noShowMode || "keep_hold");
      const tokensFinal = Number(event.tokensFinal) || computeTokensFinal({
        confirmedCount: Number(event.confirmedCount) || 1,
        minCapacity: Number(event.minCapacity) || 1,
        maxCapacity: Number(event.capacity) || 1,
        tokensMin: Number(event.tokensMin) || 0,
        tokensMax: Number(event.tokensMax) || 0,
      });

      if (mode === "refund_attended" && held > tokensFinal) {
        await applyTokenLedgerChange(adminDb, {
          userId: uid,
          type: "CREDIT",
          amount: held - tokensFinal,
          reason: "rsvp_settle_refund",
          description: `No-show settled as attended: ${event.title}`,
          idempotencyKey: `rsvp_noshow_settle_${rsvpId}`,
          eventId,
          rsvpId,
          adminUid: user.uid,
        });
      } else if (mode === "custom_debit") {
        const extra = Math.max(0, Math.floor(Number(body.extraTokens) || 0));
        if (extra > 0) {
          await applyTokenLedgerChange(adminDb, {
            userId: uid,
            type: "DEBIT",
            amount: extra,
            reason: "admin_adjust",
            description: `No-show penalty: ${event.title}`,
            idempotencyKey: `rsvp_noshow_penalty_${rsvpId}`,
            eventId,
            rsvpId,
            adminUid: user.uid,
          });
        }
      }

      await rsvpRef.update({
        noShow: true,
        noShowMode: mode,
        attended: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: uid,
        action: "weekly.no_show",
        meta: { eventId, rsvpId, mode },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("weekly action", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
