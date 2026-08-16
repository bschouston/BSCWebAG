import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

function serializeCreatedAt(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const userId = decoded.uid;
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    const balance = userDoc.data()?.tokenBalance || 0;

    const transactionsSnapshot = await adminDb
      .collection("token_transactions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(Number.isFinite(limit) ? limit : 20)
      .get();

    const transactions = transactionsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        amount: data.amount,
        reason: data.reason ?? null,
        description: data.description ?? null,
        eventId: data.eventId ?? null,
        balanceAfter: data.balanceAfter ?? null,
        createdAt: serializeCreatedAt(data.createdAt),
      };
    });

    return NextResponse.json({
      balance,
      transactions,
    });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
