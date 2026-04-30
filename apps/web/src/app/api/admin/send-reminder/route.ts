import { NextResponse, NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { sendAbandonedCartReminder } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { eventId, registrationId } = await request.json();

        if (!eventId || !registrationId) {
            return NextResponse.json({ error: "Missing eventId or registrationId" }, { status: 400 });
        }

        const [regSnap, eventSnap] = await Promise.all([
            adminDb.collection("events").doc(eventId).collection("event_registrations").doc(registrationId).get(),
            adminDb.collection("events").doc(eventId).get(),
        ]);

        if (!regSnap.exists) {
            return NextResponse.json({ error: "Registration not found" }, { status: 404 });
        }

        const reg = regSnap.data() as Record<string, any>;
        const event = eventSnap.data() as Record<string, any> | undefined;

        if (!reg.email) {
            return NextResponse.json({ error: "No email on file for this registration" }, { status: 400 });
        }

        if (reg.paymentStatus === "paid") {
            return NextResponse.json({ error: "Registration is already paid" }, { status: 400 });
        }

        const name = [reg.firstName, reg.lastName].filter(Boolean).join(" ") || "Participant";
        const eventTitle = event?.title ?? "the event";
        const amount = event?.registrationFees?.[0]?.amount
            ? Number(event.registrationFees[0].amount)
            : undefined;

        await sendAbandonedCartReminder({ to: reg.email, name, eventTitle, eventId, registrationId, amount });

        // Stamp so we know a reminder was sent
        await regSnap.ref.update({ lastReminderSentAt: new Date() });

        return NextResponse.json({ success: true, sentTo: reg.email });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to send reminder";
        console.error("Send reminder error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
