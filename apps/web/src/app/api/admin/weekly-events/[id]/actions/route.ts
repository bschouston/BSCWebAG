import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { applyTokenLedgerChange } from "@/lib/token-ledger";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { notifyWeeklyEventUpdated, notifyWeeklySettle, notifyWeeklyRsvpCancelled } from "@/lib/notify";
import { writeAdminAudit } from "@/lib/admin-audit";
import { updateWeeklyOccurrence } from "@/lib/weekly-occurrence-update";
import { cancelWeeklyRsvpAndPromote, applyAdminRsvpStatusChanges, emailAdminRsvpStatusDiffs } from "@/lib/weekly-waitlist";
import { chicagoTimeLabel, weeklyEventTraceLabel } from "@/lib/weekly-rsvp";

export const dynamic = "force-dynamic";

function memberName(user: Record<string, unknown>) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

/**
 * Admin finalize / cancel-all / no-show / RSVP override for a weekly occurrence.
 * body.action: finalize | cancel_event | cancel_rsvp | remind_token_auth | no_show | save_attendance | set_rsvp_override | update_occurrence
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
    startTimeLocal?: unknown;
    endTimeLocal?: unknown;
    locationId?: unknown;
    capacity?: unknown;
    minCapacity?: unknown;
    tokensMax?: unknown;
    tokensMin?: unknown;
    members?: unknown;
    rsvpId?: unknown;
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
  const eventTrace = weeklyEventTraceLabel(event);
  if (event.category !== "WEEKLY_SPORTS") {
    return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
  }

  if (event.status === "COMPLETED" || event.status === "CANCELLED") {
    return NextResponse.json(
      { error: "This event is already completed or cancelled", code: "OCCURRENCE_DONE" },
      { status: 400 }
    );
  }

  if (action === "update_occurrence") {
    try {
      const result = await updateWeeklyOccurrence({
        adminDb,
        eventId,
        adminUid: user.uid,
        input: {
          startTimeLocal: typeof body.startTimeLocal === "string" ? body.startTimeLocal : null,
          endTimeLocal: typeof body.endTimeLocal === "string" ? body.endTimeLocal : null,
          locationId: typeof body.locationId === "string" ? body.locationId : undefined,
          capacity: body.capacity == null || body.capacity === "" ? null : Number(body.capacity),
          minCapacity: body.minCapacity == null || body.minCapacity === "" ? null : Number(body.minCapacity),
          tokensMax: body.tokensMax == null || body.tokensMax === "" ? null : Number(body.tokensMax),
          tokensMin: body.tokensMin == null || body.tokensMin === "" ? null : Number(body.tokensMin),
        },
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.update_occurrence",
        meta: { eventId, changes: result.changes.map((c) => c.field) },
      });
      const eventAfter = await eventRef.get();
      return NextResponse.json({ ok: true, ...result, event: { id: eventId, ...eventAfter.data() } });
    } catch (err) {
      const code = err instanceof Error ? err.message : "FAILED";
      const messages: Record<string, string> = {
        NOT_FOUND: "Event not found",
        NOT_WEEKLY: "Not a weekly event",
        OCCURRENCE_DONE: "This occurrence is completed or cancelled",
        EVENT_STARTED: "The event has already started",
        DATE_LOCKED: "The calendar date cannot be changed after RSVP opens",
        START_IN_PAST: "Start time cannot be in the past",
        END_BEFORE_START: "End time must be after start time",
        CAPACITY_BELOW_CONFIRMED: "Capacity cannot be below people already confirmed",
        INVALID_CAPACITY: "Capacity must be at least 1",
        INVALID_MIN_CAPACITY: "Minimum capacity must be at least 1",
        MIN_ABOVE_MAX: "Token minimum cannot exceed the hold maximum",
        MIN_ABOVE_HOLD: "Token minimum cannot exceed tokens already held by RSVP’d members",
        MIN_CAP_ABOVE_MAX: "Minimum capacity cannot exceed capacity",
        MISSING_TIMES: "This event is missing start or end time",
      };
      return NextResponse.json({ error: messages[code] || code, code }, { status: 400 });
    }
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
    if (action === "cancel_rsvp") {
      if (event.status === "COMPLETED" || event.status === "CANCELLED") {
        return NextResponse.json({ error: "This event is already completed or cancelled" }, { status: 400 });
      }
      const rsvpId = typeof body.rsvpId === "string" ? body.rsvpId : "";
      if (!rsvpId) return NextResponse.json({ error: "rsvpId required" }, { status: 400 });
      const doc = rsvpsSnap.docs.find((d) => d.id === rsvpId);
      if (!doc || doc.data().eventId !== eventId) {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      const live = doc.data();
      const held = Number(live.tokensHeld) || 0;
      const pendingTo = Number(live.pendingTokenIncreaseTo) || 0;
      if (live.status !== "CONFIRMED" || pendingTo <= held) {
        return NextResponse.json(
          { error: "Cancel RSVP from attendance is only for members waiting on an extra token hold" },
          { status: 400 }
        );
      }
      const result = await cancelWeeklyRsvpAndPromote({
        adminDb,
        eventId,
        rsvpId,
        reason: `Admin cancelled unpaid extra hold: ${eventTrace}`,
      });
      if (!result.ok) {
        return NextResponse.json({ error: "Could not cancel RSVP" }, { status: 400 });
      }
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: String(doc.data().userId || ""),
        action: "weekly.cancel_rsvp",
        meta: { eventId, rsvpId },
      });
      const eventAfter = await eventRef.get();
      return NextResponse.json({
        ok: true,
        wasConfirmed: result.wasConfirmed,
        confirmedCount: eventAfter.data()?.confirmedCount ?? 0,
        waitlistCount: eventAfter.data()?.waitlistCount ?? 0,
      });
    }

    if (action === "remind_token_auth") {
      if (event.status === "COMPLETED" || event.status === "CANCELLED") {
        return NextResponse.json({ error: "This event is already completed or cancelled" }, { status: 400 });
      }
      const rsvpId = typeof body.rsvpId === "string" ? body.rsvpId : "";
      if (!rsvpId) return NextResponse.json({ error: "rsvpId required" }, { status: 400 });
      const doc = rsvpsSnap.docs.find((d) => d.id === rsvpId);
      if (!doc || doc.data().eventId !== eventId) {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      const data = doc.data();
      if (data.status !== "CONFIRMED") {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      const held = Number(data.tokensHeld) || 0;
      const pendingTo = Number(data.pendingTokenIncreaseTo) || 0;
      if (pendingTo <= held) {
        return NextResponse.json({ error: "No extra token hold to authorize" }, { status: 400 });
      }
      if (data.attendanceAuthReminderSentAt) {
        return NextResponse.json(
          { error: "Authorize email already sent from attendance", code: "REMINDER_ALREADY_SENT" },
          { status: 400 }
        );
      }
      const uid = String(data.userId || "");
      const u = uid ? await adminDb.collection("users").doc(uid).get() : null;
      const email = u?.data()?.email;
      if (typeof email !== "string") {
        return NextResponse.json({ error: "Member has no email" }, { status: 400 });
      }
      await notifyWeeklyEventUpdated({
        to: email,
        name: memberName((u?.data() ?? {}) as Record<string, unknown>),
        eventTitle: eventTrace,
        eventId,
        changes: [
          {
            label: "Token hold (max)",
            from: String(held),
            to: String(pendingTo),
            emphasize: true,
          },
        ],
        needsTokenAuth: true,
        newTokenHold: pendingTo,
        previousTokenHold: held,
      });
      await doc.ref.update({
        attendanceAuthReminderSentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: uid,
        action: "weekly.remind_token_auth",
        meta: { eventId, rsvpId },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "save_attendance") {
      if (event.status === "COMPLETED" || event.status === "CANCELLED") {
        return NextResponse.json({ error: "This event is already completed or cancelled" }, { status: 400 });
      }
      const rawMembers = Array.isArray(body.members) ? body.members : null;
      if (!rawMembers) {
        return NextResponse.json({ error: "members array required" }, { status: 400 });
      }
      const parsed: {
        rsvpId: string;
        status: "CONFIRMED" | "WAITLISTED" | null;
        outcome: "attended" | "no_show" | null;
        refundHeld: number;
      }[] = [];
      for (const row of rawMembers) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const rsvpId = typeof rec.rsvpId === "string" ? rec.rsvpId : "";
        if (!rsvpId) {
          return NextResponse.json({ error: "Each member needs rsvpId" }, { status: 400 });
        }
        const status =
          rec.status === "CONFIRMED" || rec.status === "WAITLISTED" ? rec.status : null;
        const outcome = rec.outcome === "no_show" ? "no_show" : rec.outcome === "attended" ? "attended" : null;
        parsed.push({
          rsvpId,
          status,
          outcome,
          refundHeld: Math.max(0, Math.floor(Number(rec.refundHeld) || 0)),
        });
      }

      let byId = new Map(rsvpsSnap.docs.map((d) => [d.id, d]));
      for (const row of parsed) {
        const doc = byId.get(row.rsvpId);
        if (!doc || doc.data().eventId !== eventId) {
          return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
        }
        const liveStatus = String(doc.data().status || "");
        const intended = row.status ?? (liveStatus === "WAITLISTED" ? "WAITLISTED" : "CONFIRMED");
        const pendingTo = Number(doc.data().pendingTokenIncreaseTo) || 0;
        const held = Number(doc.data().tokensHeld) || 0;
        if (intended === "CONFIRMED" && row.outcome && pendingTo > held) {
          return NextResponse.json(
            { error: "Cancel or wait for extra token authorization before saving attendance for that member", code: "PENDING_TOKEN_AUTH" },
            { status: 400 }
          );
        }
      }

      const statusChanges = parsed
        .filter((row) => row.status === "CONFIRMED" || row.status === "WAITLISTED")
        .map((row) => ({ rsvpId: row.rsvpId, status: row.status as "CONFIRMED" | "WAITLISTED" }));
      const statusResult = await applyAdminRsvpStatusChanges({
        adminDb,
        eventId,
        changes: statusChanges,
      });

      const afterSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
      byId = new Map(afterSnap.docs.map((d) => [d.id, d]));

      for (const row of parsed) {
        const doc = byId.get(row.rsvpId);
        if (!doc) continue;
        const data = doc.data();
        if (data.status !== "CONFIRMED" || !row.outcome) continue;
        const held = Number(data.tokensHeld) || 0;
        const pendingTo = Number(data.pendingTokenIncreaseTo) || 0;
        if (pendingTo > held) {
          return NextResponse.json(
            { error: "Cancel or wait for extra token authorization before saving attendance for that member", code: "PENDING_TOKEN_AUTH" },
            { status: 400 }
          );
        }
        const uid = String(data.userId || "");
        const alreadyRefunded = Number(data.noShowRefunded) || 0;

        if (row.outcome === "attended") {
          await doc.ref.update({
            attended: true,
            noShow: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }

        const additional = Math.max(0, Math.min(held, Math.max(0, row.refundHeld - alreadyRefunded)));
        if (additional > 0 && uid) {
          await applyTokenLedgerChange(adminDb, {
            userId: uid,
            type: "CREDIT",
            amount: additional,
            reason: "rsvp_cancel_refund",
            description: `No-show refund: ${eventTrace}`,
            idempotencyKey: `rsvp_noshow_refund_${row.rsvpId}_${alreadyRefunded + additional}`,
            eventId,
            rsvpId: row.rsvpId,
            adminUid: user.uid,
          });
        }
        await doc.ref.update({
          attended: false,
          noShow: true,
          tokensHeld: held - additional,
          noShowRefunded: alreadyRefunded + additional,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await emailAdminRsvpStatusDiffs({
        adminDb,
        eventTitle: eventTrace,
        startTime: event.startTime,
        diffs: statusResult.diffs,
      });

      await eventRef.update({
        attendanceSavedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.save_attendance",
        meta: {
          eventId,
          count: parsed.length,
          statusDiffs: statusResult.diffs.map((d) => ({
            rsvpId: d.rsvpId,
            userId: d.userId,
            from: d.from,
            to: d.to,
          })),
        },
      });
      return NextResponse.json({
        ok: true,
        confirmedCount: statusResult.confirmedCount,
        waitlistCount: statusResult.waitlistCount,
      });
    }

    if (action === "finalize") {
      const confirmed = rsvpsSnap.docs.filter((d) => d.data().status === "CONFIRMED");
      const unpaidAuth = confirmed.filter((d) => {
        const data = d.data();
        return (Number(data.pendingTokenIncreaseTo) || 0) > (Number(data.tokensHeld) || 0);
      });
      if (unpaidAuth.length > 0) {
        return NextResponse.json(
          { error: "Some members still need to authorize the extra token hold", code: "PENDING_TOKEN_AUTH" },
          { status: 400 }
        );
      }
      const unmarked = confirmed.filter((d) => {
        const data = d.data();
        return !data.noShow && !data.attended;
      });
      if (confirmed.length > 0 && (!event.attendanceSavedAt || unmarked.length > 0)) {
        return NextResponse.json(
          { error: "Save attendance before finalizing tokens", code: "ATTENDANCE_NOT_SAVED" },
          { status: 400 }
        );
      }
      const attendees = confirmed.filter((d) => !d.data().noShow);
      const waitlisted = rsvpsSnap.docs.filter((d) => d.data().status === "WAITLISTED");
      const n = attendees.length;
      const tokensFinal = computeTokensFinal({
        confirmedCount: n,
        minCapacity: Number(event.minCapacity) || 1,
        maxCapacity: Number(event.capacity) || 1,
        tokensMin: Number(event.tokensMin) || 0,
        tokensMax: Number(event.tokensMax) || 0,
      });

      for (const doc of attendees) {
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
            description: `Settle refund: ${eventTrace}`,
            idempotencyKey: `rsvp_settle_refund_${doc.id}`,
            eventId,
            rsvpId: doc.id,
            adminUid: user.uid,
          });
          await doc.ref.update({
            attended: true,
            noShow: false,
            tokensFinal,
            updatedAt: FieldValue.serverTimestamp(),
          });
          const u = await adminDb.collection("users").doc(uid).get();
          const ud = u.data() ?? {};
          if (typeof ud.email === "string") {
            notifyWeeklySettle({
              to: ud.email,
              name: memberName(ud as Record<string, unknown>),
              eventTitle: eventTrace,
              tokensHeld: held,
              tokensFinal,
              refunded: refund,
              balanceAfter: credit.balance,
            }).catch((e) => console.error("settle email", e));
          }
        } else {
          await doc.ref.update({
            attended: true,
            noShow: false,
            tokensFinal,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      for (const doc of confirmed.filter((d) => d.data().noShow)) {
        const data = doc.data();
        await doc.ref.update({
          tokensFinal: Number(data.tokensHeld) || 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
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
            description: `Waitlist release: ${eventTrace}`,
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
        rsvpManualOverride: "closed",
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
      const start = event.startTime?.toDate?.() as Date | undefined;
      const startLabel = start ? chicagoTimeLabel(start) : "";
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
            description: `Event cancelled: ${eventTrace}`,
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
        if (uid) {
          const u = await adminDb.collection("users").doc(uid).get();
          const ud = u.data() ?? {};
          if (typeof ud.email === "string") {
            notifyWeeklyRsvpCancelled({
              to: ud.email,
              name: memberName(ud as Record<string, unknown>),
              eventTitle: eventTrace,
              startLabel,
              tokensRefunded: held,
              cancelledBy: "event",
              phone: typeof ud.phone === "string" ? ud.phone : null,
            }).catch((e) => console.error("event cancel rsvp email", e));
          }
        }
      }
      await eventRef.update({
        status: "CANCELLED",
        confirmedCount: 0,
        waitlistCount: 0,
        rsvpManualOverride: "closed",
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
          description: `No-show settled as attended: ${eventTrace}`,
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
            description: `No-show penalty: ${eventTrace}`,
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
