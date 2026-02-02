import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAuth, requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
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
            startTime: data.startTime?.toDate?.()?.toISOString(),
            endTime: data.endTime?.toDate?.()?.toISOString(),
            createdAt: data.createdAt?.toDate?.()?.toISOString(),
        };

        return NextResponse.json(event);
    } catch (error) {
        console.error("Error fetching event:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const { id } = await params;
        const body = await request.json();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { ...body };

        // Convert dates if present
        if (updateData.startTime) {
            updateData.startTime = Timestamp.fromDate(new Date(updateData.startTime));
        }
        if (updateData.endTime) {
            updateData.endTime = Timestamp.fromDate(new Date(updateData.endTime));
        }

        delete updateData.id;
        delete updateData.createdAt;

        await adminDb.collection("events").doc(id).update(updateData);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Update event error:", error);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const { id } = await params;
        await adminDb.collection("events").doc(id).delete();
        return NextResponse.json({ success: true, message: "Event deleted" });
    } catch (error) {
        console.error("Delete event error:", error);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
