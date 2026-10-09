import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/**
 * Cancel an unpaid waitlist promotion: PENDING_PAYMENT → WAITLISTED.
 * Does not delete the registration. Blocks if already paid / confirmed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const { eventId, registrationId } = await params;
    const adminDb = getAdminDb();

    const regSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("event_registrations")
      .doc(registrationId)
      .get();

    if (!regSnap.exists) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const reg = regSnap.data() as Record<string, unknown>;
    const status = String(reg.status ?? "").toUpperCase();
    const payment = String(reg.paymentStatus ?? "").toLowerCase();

    if (reg.archivedAt) {
      return NextResponse.json({ error: "Registration is archived" }, { status: 400 });
    }
    if (status === "CONFIRMED" || payment === "paid" || payment === "partial") {
      return NextResponse.json(
        { error: "Cannot cancel promotion after payment or confirmation" },
        { status: 400 }
      );
    }
    if (reg.receiptStripeSession) {
      return NextResponse.json(
        { error: "Cannot cancel promotion after Stripe payment was recorded" },
        { status: 400 }
      );
    }

    const isPending =
      status === "PENDING_PAYMENT" || payment === "pending_payment" || payment === "pending";
    if (!isPending) {
      return NextResponse.json(
        { error: "Registration is not in an unpaid pending promotion state" },
        { status: 400 }
      );
    }

    await regSnap.ref.update({
      status: "WAITLISTED",
      paymentStatus: "waitlisted_no_payment",
      promotedFromWaitlistAt: FieldValue.delete(),
      promotedFromWaitlistBy: FieldValue.delete(),
      promotionCancelledAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, registrationId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel promotion";
    console.error("Cancel promotion error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
