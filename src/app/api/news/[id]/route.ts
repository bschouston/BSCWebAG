import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const doc = await adminDb.collection("news").doc(id).get();
        if (!doc.exists) {
            return NextResponse.json({ error: "Not Found" }, { status: 404 });
        }

        const data = doc.data();
        return NextResponse.json({
            id: doc.id,
            ...data,
            createdAt: data?.createdAt?.toDate().toISOString(),
            updatedAt: data?.updatedAt?.toDate().toISOString(),
            publishedAt: data?.publishedAt?.toDate().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();

        if (userData?.role !== "ADMIN" && userData?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const data = await req.json();
        const docRef = adminDb.collection("news").doc(id);

        const updateData: any = {
            ...data,
            updatedAt: Timestamp.now(),
        };

        // Update publishedAt if status changes to PUBLISHED and it wasn't before (optional logic, kept simple here)
        if (data.status === "PUBLISHED" && (!data.publishedAt)) {
            updateData.publishedAt = Timestamp.now();
        }

        await docRef.update(updateData);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating news:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();

        if (userData?.role !== "ADMIN" && userData?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await adminDb.collection("news").doc(id).delete();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting news:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
