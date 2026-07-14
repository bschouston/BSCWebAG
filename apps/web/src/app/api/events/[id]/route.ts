import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/** Accept Firestore Timestamp, Date, or ISO string. */
function toIso(value: unknown): string | null {
    if (!value) return null;
    if (
        typeof value === "object" &&
        value !== null &&
        "toDate" in value &&
        typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function toTimestamp(value: unknown): Timestamp | null {
    if (value === null || value === undefined || value === "") return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        const doc = await adminDb.collection("events").doc(id).get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        const data = doc.data();
        if (!data) return NextResponse.json({ error: "No data" }, { status: 404 });

        const event = {
            id: doc.id,
            ...data,
            startTime: toIso(data.startTime),
            endTime: toIso(data.endTime),
            createdAt: toIso(data.createdAt),
            registrationStart: toIso(data.registrationStart),
            registrationEnd: toIso(data.registrationEnd),
            registrationsClosedAt: toIso(data.registrationsClosedAt),
        };

        return NextResponse.json(event);
    } catch (error) {
        console.error("Error fetching event:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        const body = await request.json();

        const updateData: Record<string, unknown> = { ...body };

        if (!updateData.slug && updateData.title) {
            updateData.slug = String(updateData.title)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)+/g, "");
        }

        if (updateData.startTime) {
            updateData.startTime = Timestamp.fromDate(new Date(String(updateData.startTime)));
        }
        if (updateData.endTime) {
            updateData.endTime = Timestamp.fromDate(new Date(String(updateData.endTime)));
        }

        // Always normalize registration window (including explicit null to clear)
        if ("registrationStart" in updateData) {
            updateData.registrationStart = toTimestamp(updateData.registrationStart);
        }
        if ("registrationEnd" in updateData) {
            updateData.registrationEnd = toTimestamp(updateData.registrationEnd);
        }

        if (updateData.recurrenceRule === "NONE") {
            updateData.recurrenceRule = null;
        }

        // Strip UI-only / non-persisted fields
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.registrationStartAsap;
        delete updateData.registrationOpenHours;
        delete updateData.registrationCloseHours;

        await adminDb.collection("events").doc(id).update(updateData);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Update event error:", error);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const adminDb = getAdminDb();
        const { id } = await params;
        await adminDb.collection("events").doc(id).delete();
        return NextResponse.json({ success: true, message: "Event deleted" });
    } catch (error) {
        console.error("Delete event error:", error);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
