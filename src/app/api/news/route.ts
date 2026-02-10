import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get("limit");
        const limit = limitParam ? parseInt(limitParam) : 100;

        let query = adminDb.collection("news")
            .orderBy("publishedAt", "desc")
            .limit(limit);

        const snapshot = await query.get();
        const news = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Convert timestamps to ISO strings for client
            createdAt: doc.data().createdAt?.toDate().toISOString(),
            updatedAt: doc.data().updatedAt?.toDate().toISOString(),
            publishedAt: doc.data().publishedAt?.toDate().toISOString(),
        }));

        return NextResponse.json(news);
    } catch (error) {
        console.error("Error fetching news:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // Check if user is admin
        const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.data();

        if (userData?.role !== "ADMIN" && userData?.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const data = await req.json();

        // Basic validation
        if (!data.title || !data.content) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const now = Timestamp.now();
        const docRef = adminDb.collection("news").doc();

        const newArticle = {
            ...data,
            id: docRef.id,
            authorId: decodedToken.uid,
            createdAt: now,
            updatedAt: now,
            publishedAt: data.status === "PUBLISHED" ? now : null,
        };

        await docRef.set(newArticle);

        return NextResponse.json({ id: docRef.id, ...newArticle });
    } catch (error) {
        console.error("Error creating news:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
