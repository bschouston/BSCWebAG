import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function serializeCreatedAt(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const { uid } = await params;
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const balance = userDoc.data()?.tokenBalance || 0;
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const transactionsSnapshot = await adminDb
      .collection("token_transactions")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(Number.isFinite(limit) ? limit : 50)
      .get();

    const transactions = transactionsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: serializeCreatedAt(data.createdAt),
      };
    });

    return NextResponse.json({ balance, transactions });
  } catch (err) {
    console.error("GET /api/admin/users/[uid]/tokens error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { amount?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Amount must be a non-zero number" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(uid);
    const txRef = adminDb.collection("token_transactions").doc();

    const result = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const current = snap.data()?.tokenBalance || 0;
      const next = current + amount;
      if (next < 0) throw new Error("NEGATIVE_BALANCE");

      t.update(userRef, {
        tokenBalance: next,
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.set(txRef, {
        id: txRef.id,
        userId: uid,
        type: amount > 0 ? "CREDIT" : "DEBIT",
        amount: Math.abs(amount),
        description: `Admin adjustment: ${reason}`,
        adminUid: user.uid,
        createdAt: Timestamp.now(),
      });
      return next;
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "tokens.adjust",
      meta: { amount, reason, balance: result },
    });

    return NextResponse.json({ ok: true, balance: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (message === "NEGATIVE_BALANCE") {
      return NextResponse.json({ error: "Adjustment would make the balance negative" }, { status: 400 });
    }
    console.error("POST /api/admin/users/[uid]/tokens error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
