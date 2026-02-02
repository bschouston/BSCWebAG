import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const decoded = await verifyAuth(request);
    if (!decoded) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = decoded.uid;
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam) : 20;

    try {
        // 1. Get Current Balance
        const userDoc = await adminDb.collection("users").doc(userId).get();
        const balance = userDoc.data()?.tokenBalance || 0;

        // 2. Get Transaction History
        const transactionsSnapshot = await adminDb.collection("token_transactions")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();

        const transactions = transactionsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate().toISOString()
            };
        });

        return NextResponse.json({
            balance,
            transactions
        });
    } catch (error) {
        console.error("Error fetching tokens:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
