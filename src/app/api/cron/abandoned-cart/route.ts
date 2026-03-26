import { NextResponse, NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendAbandonedCartReminder } from "@/lib/email";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    // Accept either the CRON_SECRET header (automated scheduler) or a valid admin token (manual trigger)
    const cronSecret = request.headers.get("x-cron-secret");
    const isValidCronSecret = process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

    if (!isValidCronSecret) {
        const { error } = await requireAdmin(request);
        if (error) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    // ?force=true bypasses the 1-hour age check — used when an admin triggers manually
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let emailsSent = 0;
    let errors = 0;
    const skipped: string[] = [];

    try {
        // Fetch all registrations from the collection group and filter in memory.
        // This avoids needing a Firestore collection-group index entirely.
        const snapshot = await adminDb
            .collectionGroup("event_registrations")
            .get();

        const pendingDocs = snapshot.docs.filter(doc => {
            const d = doc.data();
            if (d.paymentStatus && d.paymentStatus !== "pending") return false;
            if (force) return true; // Admin manual trigger — skip age check
            // Automated: must be registered more than 1 hour ago
            const registeredAt: Date | null = d.registeredAt?.toDate?.() ?? (d.registeredAt ? new Date(d.registeredAt) : null);
            if (!registeredAt) return false;
            return registeredAt <= oneHourAgo;
        });

        // Fetch event data in parallel, grouped by eventId
        const eventIds = [...new Set(
            pendingDocs
                .map(doc => doc.ref.parent.parent?.id)
                .filter(Boolean) as string[]
        )];

        const eventMap: Record<string, Record<string, any>> = {};
        await Promise.all(
            eventIds.map(async (eventId) => {
                const snap = await adminDb.collection("events").doc(eventId).get();
                if (snap.exists) eventMap[eventId] = snap.data() as Record<string, any>;
            })
        );

        await Promise.all(
            pendingDocs.map(async (doc) => {
                const data = doc.data();
                const registrationId = doc.id;
                const eventId = doc.ref.parent.parent?.id;

                if (!eventId) { skipped.push(registrationId); return; }
                if (!data.email) { skipped.push(registrationId); return; }

                // Skip if a reminder was already sent within the last 22 hours to prevent spam
                if (data.lastReminderSentAt) {
                    const lastSent: Date = data.lastReminderSentAt?.toDate?.() ?? new Date(data.lastReminderSentAt);
                    const hoursAgo = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
                    if (hoursAgo < 22) { skipped.push(registrationId); return; }
                }

                const event = eventMap[eventId];
                const eventTitle = event?.title ?? "the event";
                const amount = event?.registrationFees?.[0]?.amount
                    ? Number(event.registrationFees[0].amount)
                    : undefined;
                const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || "Participant";

                try {
                    await sendAbandonedCartReminder({
                        to: data.email,
                        name,
                        eventTitle,
                        eventId,
                        registrationId,
                        amount,
                    });

                    await doc.ref.update({ lastReminderSentAt: new Date() });
                    emailsSent++;
                } catch (err) {
                    console.error(`Failed to send reminder to ${data.email}:`, err);
                    errors++;
                }
            })
        );

        return NextResponse.json({
            success: true,
            emailsSent,
            skipped: skipped.length,
            errors,
        });
    } catch (error: unknown) {
        // Firebase Admin SDK stores the full FAILED_PRECONDITION message (incl. index URL) in
        // error.details or as a stringified representation — capture everything available.
        const err = error as any;
        const message =
            err?.details ||
            err?.message ||
            (typeof err?.toString === "function" ? err.toString() : String(error));
        console.error("Abandoned cart cron error:", JSON.stringify({ message, details: err?.details, code: err?.code }));
        return NextResponse.json({ error: message, details: err?.details, code: err?.code }, { status: 500 });
    }
}
