import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["CONFIRMED", "WAITLISTED", "CANCELLED"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const { uid } = await params;
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    type MemberEventRow = {
      id: string;
      source: "event_rsvps" | "event_registrations";
      eventId: string | null;
      eventTitle: string;
      status: string;
      waitlistPosition: number | null;
      createdAt: string | null;
    };

    const rsvpsSnap = await adminDb.collection("event_rsvps").where("userId", "==", uid).get();
    const eventIds = [
      ...new Set(
        rsvpsSnap.docs
          .map((d) => d.data().eventId as string | undefined)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const eventSnaps =
      eventIds.length > 0
        ? await adminDb.getAll(...eventIds.map((id) => adminDb.collection("events").doc(id)))
        : [];
    const eventTitles = new Map(
      eventSnaps.map((snap) => [snap.id, String(snap.data()?.title ?? snap.id)])
    );

    const rsvps: MemberEventRow[] = rsvpsSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const eventId = (data.eventId as string | undefined) ?? null;
      return {
        id: docSnap.id,
        source: "event_rsvps" as const,
        eventId,
        eventTitle: eventId ? (eventTitles.get(eventId) ?? eventId) : "Event",
        status: String(data.status ?? "CONFIRMED"),
        waitlistPosition: typeof data.waitlistPosition === "number" ? data.waitlistPosition : null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    const items = rsvps.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/users/[uid]/rsvps error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { id?: string; source?: string; eventId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = String(body.status ?? "").toUpperCase().trim();
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!body.id || !body.source) {
    return NextResponse.json({ error: "id and source are required" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();

    if (body.source === "event_rsvps") {
      const ref = adminDb.collection("event_rsvps").doc(body.id);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.userId !== uid) {
        return NextResponse.json({ error: "RSVP not found" }, { status: 404 });
      }
      await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    } else if (body.source === "event_registrations") {
      if (!body.eventId) {
        return NextResponse.json({ error: "eventId is required" }, { status: 400 });
      }
      const ref = adminDb
        .collection("events")
        .doc(body.eventId)
        .collection("event_registrations")
        .doc(body.id);
      const snap = await ref.get();
      if (!snap.exists) {
        return NextResponse.json({ error: "Registration not found" }, { status: 404 });
      }
      await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    } else {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "rsvp.status",
      meta: { id: body.id, source: body.source, status },
    });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("PATCH /api/admin/users/[uid]/rsvps error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
