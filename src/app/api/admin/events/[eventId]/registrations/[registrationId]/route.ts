import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const { eventId, registrationId } = await params;
        const { paymentStatus } = await request.json();

        if (!paymentStatus || !["pending", "paid"].includes(paymentStatus)) {
            return NextResponse.json({ error: "Invalid paymentStatus value" }, { status: 400 });
        }

        await adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .doc(registrationId)
            .update({ paymentStatus });

        return NextResponse.json({ success: true, paymentStatus });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update registration";
        console.error("Update registration error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
