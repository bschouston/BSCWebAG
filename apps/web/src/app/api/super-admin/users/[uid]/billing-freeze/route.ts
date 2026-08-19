import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { unfreezeUserBilling } from "@/lib/billing-freeze";

export const dynamic = "force-dynamic";

/** Super Admin: unfreeze a member wallet after dispute review (no auto clawback). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { note?: unknown; freeze?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Explicit freeze only via Stripe webhooks; this endpoint unfreezes (or re-asserts freeze for ops)
  const freeze = body.freeze === true;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (freeze) {
      const { FieldValue } = await import("firebase-admin/firestore");
      const { writeAdminAudit } = await import("@/lib/admin-audit");
      await adminDb.collection("users").doc(uid).update({
        billingFrozen: true,
        billingFrozenAt: FieldValue.serverTimestamp(),
        billingFrozenReason: "manual",
        billingFreezeMeta: {
          eventType: "manual",
          note: note || null,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: uid,
        action: "billing.freeze_manual",
        meta: { note: note || null },
      });
      return NextResponse.json({ ok: true, billingFrozen: true });
    }

    await unfreezeUserBilling({ uid, adminUid: user.uid, note });
    return NextResponse.json({ ok: true, billingFrozen: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("POST billing-freeze error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
