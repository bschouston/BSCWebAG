import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { parseActualCostUsd } from "@/lib/token-economics";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { id: eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  }

  let body: { actualCostUsd?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseActualCostUsd(body.actualCostUsd);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("events").doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const data = snap.data() ?? {};
    if (data.category !== "WEEKLY_SPORTS") {
      return NextResponse.json(
        { error: "Cost tracking is only available for weekly sports events" },
        { status: 400 }
      );
    }

    const previous =
      typeof data.actualCostUsd === "number" && Number.isFinite(data.actualCostUsd)
        ? data.actualCostUsd
        : null;

    await ref.update({
      actualCostUsd: parsed.value,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: `event:${eventId}`,
      action: "weekly.set_actual_cost",
      meta: { eventId, previous, actualCostUsd: parsed.value },
    });

    return NextResponse.json({ ok: true, actualCostUsd: parsed.value });
  } catch (err) {
    console.error("PATCH weekly-events cost:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
