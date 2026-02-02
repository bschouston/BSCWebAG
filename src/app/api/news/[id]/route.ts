import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: "Article ID required" }, { status: 400 });
        }

        const docSnapshot = await adminDb.collection("news").doc(id).get();

        if (!docSnapshot.exists) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        const data = docSnapshot.data();

        const article = {
            id: docSnapshot.id,
            ...data,
            publishedAt: data?.publishedAt?.toDate?.()?.toISOString(),
            createdAt: data?.createdAt?.toDate?.()?.toISOString(),
            updatedAt: data?.updatedAt?.toDate?.()?.toISOString(),
        };

        return NextResponse.json(article);
    } catch (error) {
        console.error("Error fetching article:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
