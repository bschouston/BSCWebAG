import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { sendAbandonedCartReminder } from "@/lib/email";
import { registrationFeeAmount, registrationDisplayAmount } from "@/lib/registration-fee";

export const dynamic = "force-dynamic";

/**
 * Admin create-only registration (register on behalf).
 * Bypasses public close/waitlist gates. Never updates existing registrations.
 * Creates PENDING_PAYMENT + emails the player a resume/pay link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    // Create-only: reject any attempt to patch an existing registration.
    if (body.registrationId) {
      return NextResponse.json(
        { error: "This endpoint only creates new registrations." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const eventData = eventSnap.data() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return NextResponse.json({ error: "Participant email is required" }, { status: 400 });
    }

    const amount = registrationFeeAmount(eventData.registrationFees as any);
    if (amount == null || amount <= 0) {
      return NextResponse.json(
        { error: "Event has no positive registration fee configured." },
        { status: 400 }
      );
    }

    const {
      registrationId: _rid,
      eventId: _eid,
      isDraft: _draft,
      paymentStatus: _ps,
      status: _st,
      adminCreatedBy: _acb,
      adminCreatedAt: _aca,
      ...formFields
    } = body;

    const docRef = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("event_registrations")
      .add({
        ...formFields,
        email,
        eventId,
        isDraft: false,
        paymentStatus: "pending_payment",
        status: "PENDING_PAYMENT",
        amount,
        adminCreatedBy: user!.uid,
        adminCreatedAt: FieldValue.serverTimestamp(),
        registeredAt: FieldValue.serverTimestamp(),
      });

    const registrationId = docRef.id;
    const name =
      [body.firstName, body.lastName].filter((v) => typeof v === "string" && v.trim()).join(" ") ||
      "Participant";
    const eventTitle =
      typeof eventData.title === "string" && eventData.title.trim()
        ? eventData.title
        : "the event";
    const displayAmount = registrationDisplayAmount({
      registrationAmount: amount,
      fees: eventData.registrationFees as any,
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
      await docRef.update({ lastReminderSentAt: FieldValue.serverTimestamp() });
    } catch (emailErr) {
      console.error("Admin proxy pay email failed:", emailErr);
    }

    return NextResponse.json({
      success: true,
      registrationId,
      id: registrationId,
      sentTo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create registration";
    console.error("Admin register-on-behalf error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
