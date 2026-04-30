import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { eventId, registrationId } = await params;
        const body = await request.json();
        const { paymentStatus, updates } = body as {
            paymentStatus?: string;
            updates?: Record<string, unknown>;
        };

        const updateData: Record<string, unknown> = {};

        if (paymentStatus !== undefined) {
            if (!["pending", "paid", "partial"].includes(paymentStatus)) {
                return NextResponse.json({ error: "Invalid paymentStatus value" }, { status: 400 });
            }
            updateData.paymentStatus = paymentStatus;
        }

        if (updates && typeof updates === "object") {
            const allowed = new Set([
                "title",
                "firstName",
                "lastName",
                "email",
                "whatsappNumber",
                "its",
                "jamaatAffiliation",
                "dateOfBirth",
                "studentStatus",
                "tshirtSize",
                "heightFeet",
                "heightInches",
                "weight",
                "instagramHandle",
                "isCaptain",
                "playFrequency",
                "priorExperience",
                "participatedYears",
                "strongestPosition",
                "skills",
                "injuries",
                "draftPitch",
                "ideas",
                "iceFirstName",
                "iceLastName",
                "icePhone",
                "foodAllergies",
                "interestedInTeamOwnership",
            ]);

            for (const [k, v] of Object.entries(updates)) {
                if (allowed.has(k)) updateData[k] = v;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        await adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .doc(registrationId)
            .update(updateData);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update registration";
        console.error("Update registration error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { eventId, registrationId } = await params;

        await adminDb
            .collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .doc(registrationId)
            .delete();

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete registration";
        console.error("Delete registration error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
