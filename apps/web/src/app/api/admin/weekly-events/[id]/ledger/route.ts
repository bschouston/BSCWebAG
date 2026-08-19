import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  AUDIT_ACTION_LABELS,
  TOKEN_KIND_LABELS,
  classifyTokenKind,
  memberOutcome,
  netTokensRefunded,
  type WeeklyEventLedgerResponse,
  type WeeklyLedgerActivity,
  type WeeklyLedgerMember,
  type WeeklyLedgerTokenKind,
} from "@/lib/weekly-event-ledger";
import { weeklyLedgerDescriptionForDisplay } from "@/lib/weekly-rsvp";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function toMillis(value: unknown): number {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function memberName(user: Record<string, unknown> | undefined): string {
  if (!user) return "Member";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

type StatusDiff = { rsvpId?: unknown; userId?: unknown; from?: unknown; to?: unknown };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id: eventId } = await params;
  const adminDb = getAdminDb();

  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const event = eventSnap.data() ?? {};
  if (event.category !== "WEEKLY_SPORTS") {
    return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
  }

  const [rsvpsSnap, txsSnap] = await Promise.all([
    adminDb.collection("event_rsvps").where("eventId", "==", eventId).get(),
    adminDb.collection("token_transactions").where("eventId", "==", eventId).get(),
  ]);

  const audits: {
    id: string;
    action: string;
    at: unknown;
    targetUid: string;
    statusDiffs: StatusDiff[];
  }[] = [];
  try {
    const auditSnap = await adminDb.collection("adminAudit").where("meta.eventId", "==", eventId).get();
    for (const doc of auditSnap.docs) {
      const data = doc.data();
      const meta = (data.meta ?? {}) as { statusDiffs?: StatusDiff[] };
      audits.push({
        id: doc.id,
        action: String(data.action || ""),
        at: data.at,
        targetUid: String(data.targetUid || ""),
        statusDiffs: Array.isArray(meta.statusDiffs) ? meta.statusDiffs : [],
      });
    }
  } catch (err) {
    console.warn("weekly ledger adminAudit query failed", err);
  }

  const txs = txsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: String(data.userId || ""),
      rsvpId: typeof data.rsvpId === "string" ? data.rsvpId : null,
      type: data.type === "CREDIT" ? ("CREDIT" as const) : ("DEBIT" as const),
      amount: Number(data.amount) || 0,
      reason: String(data.reason || ""),
      description: String(data.description || ""),
      idempotencyKey: String(data.idempotencyKey || doc.id),
      createdAt: data.createdAt,
    };
  });

  const userIds = new Set<string>();
  for (const doc of rsvpsSnap.docs) {
    const uid = String(doc.data().userId || "");
    if (uid) userIds.add(uid);
  }
  for (const tx of txs) {
    if (tx.userId) userIds.add(tx.userId);
  }
  for (const audit of audits) {
    if (audit.targetUid && !audit.targetUid.startsWith("event:")) userIds.add(audit.targetUid);
    for (const d of audit.statusDiffs) {
      if (typeof d.userId === "string" && d.userId) userIds.add(d.userId);
    }
  }

  const users = new Map<string, Record<string, unknown>>();
  await Promise.all(
    [...userIds].map(async (uid) => {
      const snap = await adminDb.collection("users").doc(uid).get();
      if (snap.exists) users.set(uid, (snap.data() ?? {}) as Record<string, unknown>);
    })
  );

  const eventStatus = String(event.status || "");
  const txsByRsvp = new Map<string, typeof txs>();
  const txsByUser = new Map<string, typeof txs>();
  for (const tx of txs) {
    if (tx.rsvpId) {
      const list = txsByRsvp.get(tx.rsvpId) ?? [];
      list.push(tx);
      txsByRsvp.set(tx.rsvpId, list);
    }
    if (tx.userId) {
      const list = txsByUser.get(tx.userId) ?? [];
      list.push(tx);
      txsByUser.set(tx.userId, list);
    }
  }

  const members: WeeklyLedgerMember[] = rsvpsSnap.docs.map((doc) => {
    const data = doc.data();
    const userId = String(data.userId || "");
    const related = txsByRsvp.get(doc.id) ?? txsByUser.get(userId) ?? [];
    const kinds = related.map((tx) =>
      classifyTokenKind({
        reason: tx.reason,
        description: tx.description,
        idempotencyKey: tx.idempotencyKey,
      })
    );
    const heldFromTx = related
      .filter((tx) => {
        const kind = classifyTokenKind({
          reason: tx.reason,
          description: tx.description,
          idempotencyKey: tx.idempotencyKey,
        });
        return tx.type === "DEBIT" && (kind === "hold" || kind === "hold_increase" || kind === "noshow_penalty");
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
    const grossCredits = related
      .filter((tx) => tx.type === "CREDIT")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const debited = related.filter((tx) => tx.type === "DEBIT").reduce((sum, tx) => sum + tx.amount, 0);
    const charged = Math.max(0, debited - grossCredits);
    const refunded = netTokensRefunded(debited, charged);
    const heldFallback = (Number(data.tokensHeld) || 0) + (Number(data.noShowRefunded) || 0);
    const user = users.get(userId);
    const outcome = memberOutcome({
      eventStatus,
      rsvpStatus: String(data.status || ""),
      attended: Boolean(data.attended),
      noShow: Boolean(data.noShow),
      kinds,
    });
    return {
      userId,
      rsvpId: doc.id,
      name: memberName(user),
      email: typeof user?.email === "string" ? user.email : null,
      outcome,
      tokensHeld: heldFromTx || heldFallback,
      tokensCharged: charged,
      tokensRefunded: refunded,
      tokensFinal: typeof data.tokensFinal === "number" ? data.tokensFinal : null,
      status: String(data.status || ""),
    };
  });

  members.sort((a, b) => a.name.localeCompare(b.name) || a.rsvpId.localeCompare(b.rsvpId));

  const costPerAttendee =
    typeof event.tokensFinal === "number"
      ? event.tokensFinal
      : members.find((m) => m.outcome === "attended" && m.tokensFinal != null)?.tokensFinal ?? null;

  const totals = {
    attendeesCharged: members.filter((m) => m.outcome === "attended").length,
    costPerAttendee,
    netCollected: members.reduce((sum, m) => sum + m.tokensCharged, 0),
    tokensRefunded: members.reduce((sum, m) => sum + m.tokensRefunded, 0),
    noShowCount: members.filter((m) => m.outcome === "no_show").length,
    waitlistReleased: members.filter((m) => m.outcome === "waitlist_released").length,
    cancelledRsvps: members.filter((m) => m.outcome === "cancelled").length,
  };

  const activity: WeeklyLedgerActivity[] = [];

  for (const tx of txs) {
    const kind: WeeklyLedgerTokenKind = classifyTokenKind({
      reason: tx.reason,
      description: tx.description,
      idempotencyKey: tx.idempotencyKey,
    });
    const signed = tx.type === "CREDIT" ? tx.amount : -tx.amount;
    activity.push({
      id: `tx:${tx.id}`,
      at: toIso(tx.createdAt),
      source: "token",
      kind,
      label: TOKEN_KIND_LABELS[kind],
      userId: tx.userId || null,
      name: tx.userId ? memberName(users.get(tx.userId)) : null,
      type: tx.type,
      amount: tx.amount,
      signedAmount: signed,
      description: weeklyLedgerDescriptionForDisplay(tx.description || "", event) || null,
    });
  }

  for (const audit of audits) {
    const at = toIso(audit.at);
    const userId = audit.targetUid.startsWith("event:") ? null : audit.targetUid || null;
    activity.push({
      id: `audit:${audit.id}`,
      at,
      source: "audit",
      kind: audit.action,
      label: AUDIT_ACTION_LABELS[audit.action] ?? audit.action,
      userId,
      name: userId ? memberName(users.get(userId)) : null,
      type: null,
      amount: null,
      signedAmount: null,
      description: null,
    });

    if (audit.action === "weekly.save_attendance") {
      audit.statusDiffs.forEach((diff, index) => {
        const from = String(diff.from || "");
        const to = String(diff.to || "");
        const uid = typeof diff.userId === "string" ? diff.userId : "";
        const promoted = from === "WAITLISTED" && to === "CONFIRMED";
        activity.push({
          id: `audit:${audit.id}:diff:${index}`,
          at,
          source: "audit",
          kind: promoted ? "promoted" : "demoted",
          label: promoted ? "Promoted to confirmed" : "Moved to waitlist",
          userId: uid || null,
          name: uid ? memberName(users.get(uid)) : null,
          type: null,
          amount: null,
          signedAmount: null,
          description: `${from} → ${to}`,
        });
      });
    }
  }

  activity.sort((a, b) => {
    const dt = toMillis(a.at) - toMillis(b.at);
    if (dt !== 0) return dt;
    if (a.source !== b.source) return a.source === "token" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const body: WeeklyEventLedgerResponse = {
    event: {
      id: eventId,
      title: String(event.title || ""),
      status: eventStatus,
      tokensFinal: typeof event.tokensFinal === "number" ? event.tokensFinal : null,
    },
    totals,
    members,
    activity,
  };
  return NextResponse.json(body);
}
