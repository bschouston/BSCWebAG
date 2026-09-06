import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { generateAllSeriesHorizons } from "@/lib/weekly-series";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { notifyBelowMinAdmin, notifyWeeklyOverdueDigest } from "@/lib/notify";
import { cancelWeeklyRsvpAndPromote } from "@/lib/weekly-waitlist";
import {
  chicagoTimeLabel,
  weeklyEventTraceLabel,
  weeklyOccurrenceOverdue,
} from "@/lib/weekly-rsvp";
import { chicagoDateKey } from "@/lib/chicago-time";
import { chicagoWeekStart } from "@/lib/token-report-query";

export const dynamic = "force-dynamic";

const OVERDUE_DIGEST_DOC = "system/weeklyOverdueDigest";

function isCronAuthorized(request: NextRequest) {
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && (cronSecretHeader === cronSecret || bearerToken === cronSecret));
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    const { error } = await requireAdmin(request);
    if (error) return error;
  }

  try {
    const horizon = await generateAllSeriesHorizons();
    const adminDb = getAdminDb();
    const now = new Date();
    const eventsSnap = await adminDb
      .collection("events")
      .where("category", "==", "WEEKLY_SPORTS")
      .get();

    let closed = 0;
    let pendingCancelled = 0;
    let overdueCount = 0;
    let overdueDigestSent = false;
    const adminEmails: string[] = [];
    const admins = await adminDb.collection("users").where("role", "in", ["ADMIN", "SUPER_ADMIN"]).get();
    for (const a of admins.docs) {
      const email = a.data().email;
      if (typeof email === "string" && email) adminEmails.push(email);
    }

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const closes = data.rsvpClosesAt?.toDate?.() as Date | undefined;
      if (!closes || closes.getTime() > now.getTime()) continue;
      if (data.rsvpClosedNotifiedAt) continue;
      const confirmed = Number(data.confirmedCount) || 0;
      const minCapacity = Number(data.minCapacity) || 0;
      const preview = computeTokensFinal({
        confirmedCount: confirmed,
        minCapacity: minCapacity || 1,
        maxCapacity: Number(data.capacity) || minCapacity || 1,
        tokensMin: Number(data.tokensMin) || 0,
        tokensMax: Number(data.tokensMax) || 0,
      });
      await doc.ref.update({
        rsvpClosedNotifiedAt: now,
        settlePreviewTokens: preview,
        settlePreviewCount: confirmed,
      });
      closed += 1;
      if (minCapacity && confirmed < minCapacity) {
        for (const to of adminEmails) {
          notifyBelowMinAdmin({
            to,
            eventTitle: weeklyEventTraceLabel(data),
            confirmed,
            minCapacity,
            eventId: doc.id,
          }).catch((e) => console.error("below-min email", e));
        }
      }
    }

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const start = data.startTime?.toDate?.() as Date | undefined;
      if (!start || start.getTime() > now.getTime()) continue;
      if (data.status === "CANCELLED") continue;
      const rsvps = await adminDb.collection("event_rsvps").where("eventId", "==", doc.id).get();
      for (const r of rsvps.docs) {
        const rd = r.data();
        const pending = Number(rd.pendingTokenIncreaseTo) || 0;
        const held = Number(rd.tokensHeld) || 0;
        if (pending <= held) continue;
        if (rd.status !== "CONFIRMED" && rd.status !== "WAITLISTED") continue;
        const result = await cancelWeeklyRsvpAndPromote({
          adminDb,
          eventId: doc.id,
          rsvpId: r.id,
          reason: `Unapproved token increase cancelled: ${data.title}`,
        });
        if (result.ok) pendingCancelled += 1;
      }
    }

    const overdueItems: Array<{ eventId: string; title: string; whenLabel: string }> = [];
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      if (
        !weeklyOccurrenceOverdue(
          {
            category: data.category,
            status: data.status,
            startTime: data.startTime,
            endTime: data.endTime,
          },
          now
        )
      ) {
        continue;
      }
      overdueItems.push({
        eventId: doc.id,
        title: weeklyEventTraceLabel(data),
        whenLabel: chicagoTimeLabel(data.startTime ?? data.endTime),
      });
    }
    overdueCount = overdueItems.length;

    if (overdueItems.length > 0 && adminEmails.length > 0) {
      // Cron runs hourly; claim this Chicago week once before sending so races
      // cannot re-send on every tick.
      const weekKey = chicagoWeekStart(chicagoDateKey(now));
      const digestRef = adminDb.doc(OVERDUE_DIGEST_DOC);
      const claimed = await adminDb.runTransaction(async (tx) => {
        const digestSnap = await tx.get(digestRef);
        const data = digestSnap.data() ?? {};
        const priorWeekKey =
          typeof data.lastSentChicagoWeekKey === "string"
            ? data.lastSentChicagoWeekKey
            : typeof data.lastSentChicagoDateKey === "string"
              ? chicagoWeekStart(data.lastSentChicagoDateKey)
              : null;
        if (priorWeekKey === weekKey) return false;
        tx.set(
          digestRef,
          {
            lastSentChicagoWeekKey: weekKey,
            lastSentChicagoDateKey: chicagoDateKey(now),
            lastSentAt: now,
            lastOverdueCount: overdueItems.length,
          },
          { merge: true }
        );
        return true;
      });
      if (claimed) {
        for (const to of adminEmails) {
          try {
            await notifyWeeklyOverdueDigest({ to, items: overdueItems });
          } catch (e) {
            console.error("overdue digest email", e);
          }
        }
        overdueDigestSent = true;
      }
    }

    return NextResponse.json({
      ok: true,
      horizon,
      closed,
      pendingCancelled,
      overdueCount,
      overdueDigestSent,
    });
  } catch (err) {
    console.error("weekly cron", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
