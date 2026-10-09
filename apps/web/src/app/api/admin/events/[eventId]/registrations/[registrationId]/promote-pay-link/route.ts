import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { sendAbandonedCartReminder } from "@/lib/email";
import { registrationFeeAmount, registrationDisplayAmount } from "@/lib/registration-fee";
import { registrationIsWaitlisted } from "@/lib/registration-status";

export const dynamic = "force-dynamic";

/**
 * Promote a waitlisted registration to PENDING_PAYMENT and email the resume/pay link.
 * Does NOT set CONFIRMED — confirmation happens after Stripe webhook or offline Mark Paid.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  try {
    const { eventId, registrationId } = await params;
    const adminDb = getAdminDb();

    const [regSnap, eventSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).collection("event_registrations").doc(registrationId).get(),
      adminDb.collection("events").doc(eventId).get(),
    ]);

    if (!regSnap.exists) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const reg = regSnap.data() as Record<string, unknown>;
    const event = eventSnap.data() as Record<string, unknown>;

    if (reg.archivedAt) {
      return NextResponse.json({ error: "Registration is archived" }, { status: 400 });
    }

    const status = String(reg.status ?? "").toUpperCase();
    const payment = String(reg.paymentStatus ?? "").toLowerCase();

    if (status === "CANCELLED" || status === "CANCELED") {
      return NextResponse.json({ error: "Registration is cancelled" }, { status: 400 });
    }
    if (status === "CONFIRMED" || payment === "paid" || payment === "partial") {
      return NextResponse.json({ error: "Registration is already confirmed or paid" }, { status: 400 });
    }
    if (!registrationIsWaitlisted({ status: String(reg.status ?? ""), paymentStatus: String(reg.paymentStatus ?? "") })) {
      return NextResponse.json({ error: "Registration is not on the waitlist" }, { status: 400 });
    }

    const email = typeof reg.email === "string" ? reg.email.trim() : "";
    if (!email) {
      return NextResponse.json({ error: "No email on file for this registration" }, { status: 400 });
    }

    const amount =
      registrationFeeAmount(event.registrationFees as any) ??
      (typeof reg.amount === "number" && reg.amount > 0 ? reg.amount : null);

    const update: Record<string, unknown> = {
      status: "PENDING_PAYMENT",
      paymentStatus: "pending_payment",
      isDraft: false,
      promotedFromWaitlistAt: FieldValue.serverTimestamp(),
      promotedFromWaitlistBy: user!.uid,
      promotionCancelledAt: FieldValue.delete(),
    };
    if (amount != null && amount > 0 && reg.amount == null) {
      update.amount = amount;
    }

    await regSnap.ref.update(update);

    const name =
      [reg.firstName, reg.lastName].filter((v) => typeof v === "string" && String(v).trim()).join(" ") ||
      "Participant";
    const eventTitle =
      typeof event.title === "string" && event.title.trim() ? event.title : "the event";
    const displayAmount = registrationDisplayAmount({
      registrationAmount: amount ?? reg.amount,
      fees: event.registrationFees as any,
    });

    let sentTo: string | null = null;
    try {
      await sendAbandonedCartReminder({
        to: email,
        name,
        eventTitle,
        eventId,
        registrationId,
        amount: displayAmount,
      });
      sentTo = email;
      await regSnap.ref.update({ lastReminderSentAt: FieldValue.serverTimestamp() });
    } catch (emailErr) {
      console.error("Promote pay-link email failed:", emailErr);
    }

    return NextResponse.json({ success: true, registrationId, sentTo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to promote registration";
    console.error("Promote pay-link error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
