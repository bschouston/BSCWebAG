import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { generateAllSeriesHorizons } from "@/lib/weekly-series";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { notifyBelowMinAdmin } from "@/lib/notify";

export const dynamic = "force-dynamic";

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
            eventTitle: String(data.title || "Weekly event"),
            confirmed,
            minCapacity,
            eventId: doc.id,
          }).catch((e) => console.error("below-min email", e));
        }
      }
    }

    return NextResponse.json({ ok: true, horizon, closed });
  } catch (err) {
    console.error("weekly cron", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
