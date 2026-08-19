import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { descriptionsWithWeeklyEventSlug } from "@/lib/token-tx-weekly-description";

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

function toMillis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
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
    const cap = Number.isFinite(limit) ? limit : 20;

    let docs: QueryDocumentSnapshot[];
    try {
      const transactionsSnapshot = await adminDb
        .collection("token_transactions")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(cap)
        .get();
      docs = transactionsSnapshot.docs;
    } catch (indexErr) {
      console.warn("token_transactions composite index missing; sorting in memory", indexErr);
      const fallback = await adminDb
        .collection("token_transactions")
        .where("userId", "==", userId)
        .limit(Math.max(cap * 4, 100))
        .get();
      docs = [...fallback.docs]
        .sort((a, b) => toMillis(b.data().createdAt) - toMillis(a.data().createdAt))
        .slice(0, cap);
    }

    const descriptions = await descriptionsWithWeeklyEventSlug(
      adminDb,
      docs.map((doc) => doc.data())
    );
    const transactions = docs.map((doc, i) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        amount: data.amount,
        reason: data.reason ?? null,
        description: descriptions[i],
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
