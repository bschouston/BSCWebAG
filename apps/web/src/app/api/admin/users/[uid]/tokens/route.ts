import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin, requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { applyTokenLedgerChange } from "@/lib/token-ledger";
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
    const cap = Number.isFinite(limit) ? limit : 50;

    let docs: QueryDocumentSnapshot[];
    try {
      const transactionsSnapshot = await adminDb
        .collection("token_transactions")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(cap)
        .get();
      docs = transactionsSnapshot.docs;
    } catch {
      const fallback = await adminDb
        .collection("token_transactions")
        .where("userId", "==", uid)
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
        ...data,
        description: descriptions[i] ?? data.description ?? null,
        createdAt: serializeCreatedAt(data.createdAt),
      };
    });

    return NextResponse.json({ balance, transactions });
  } catch (err) {
    console.error("GET /api/admin/users/[uid]/tokens error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Manual adjust — Super Admin only; always ledger + audit. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { amount?: unknown; reason?: unknown; clientRequestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const clientRequestId =
    typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";

  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json(
      { error: "Amount must be a non-zero whole number" },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }
  if (clientRequestId && !/^[a-zA-Z0-9_-]{8,64}$/.test(clientRequestId)) {
    return NextResponse.json(
      { error: "clientRequestId must be 8–64 chars (letters, numbers, _-)" },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const abs = Math.abs(amount);
    const type = amount > 0 ? "CREDIT" : "DEBIT";
    const { randomUUID } = await import("node:crypto");
    const idempotencyKey = clientRequestId
      ? `admin_adjust_${uid}_${clientRequestId}`
      : `admin_adjust_${uid}_${user.uid}_${randomUUID()}`;

    const result = await applyTokenLedgerChange(adminDb, {
      userId: uid,
      type,
      amount: abs,
      reason: "admin_adjust",
      description: `Admin adjustment: ${reason}`,
      idempotencyKey,
      adminUid: user.uid,
      meta: { reason, clientRequestId: clientRequestId || null },
    });

    if (result.replayed) {
      return NextResponse.json({
        ok: true,
        balance: result.balance,
        replayed: true,
      });
    }

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "tokens.adjust",
      meta: { amount, reason, balance: result.balance, idempotencyKey },
    });

    return NextResponse.json({ ok: true, balance: result.balance, replayed: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (message === "NEGATIVE_BALANCE") {
      return NextResponse.json(
        { error: "Adjustment would make the balance negative" },
        { status: 400 }
      );
    }
    console.error("POST /api/admin/users/[uid]/tokens error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
