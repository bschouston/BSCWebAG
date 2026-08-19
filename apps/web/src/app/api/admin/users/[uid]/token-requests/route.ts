import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { sendTokenRequestCreatedEmail } from "@/lib/email";
import {
  TOKEN_REQUESTS_COLLECTION,
  getPendingTokenRequest,
  serializeTokenRequest,
} from "@/lib/token-request";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { uid } = await params;
  const adminDb = getAdminDb();
  const pending = await getPendingTokenRequest(adminDb, uid);
  return NextResponse.json({ pendingTokenRequest: pending });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
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
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive whole number" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Reason is required" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const created = await adminDb.runTransaction(async (t) => {
      const userRef = adminDb.collection("users").doc(uid);
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error("NOT_FOUND");
      const pendingId = userSnap.data()?.pendingTokenRequestId;
      if (typeof pendingId === "string" && pendingId) {
        const existing = await t.get(adminDb.collection(TOKEN_REQUESTS_COLLECTION).doc(pendingId));
        if (existing.exists && existing.data()?.status === "pending") {
          throw new Error("ALREADY_PENDING");
        }
      }
      const requestRef = adminDb.collection(TOKEN_REQUESTS_COLLECTION).doc();
      t.set(requestRef, {
        memberUid: uid,
        adminUid: user.uid,
        amount,
        reason,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      });
      t.update(userRef, {
        pendingTokenRequestId: requestRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: requestRef.id, email: userSnap.data()?.email, nameParts: userSnap.data() };
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "tokens.request",
      meta: { requestId: created.id, amount, reason },
    });

    const email = typeof created.email === "string" ? created.email : null;
    if (email) {
      const d = (created.nameParts ?? {}) as Record<string, unknown>;
      const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || "Member";
      sendTokenRequestCreatedEmail({ to: email, name, amount, reason }).catch((e) =>
        console.error("token request created email:", e)
      );
    }

    return NextResponse.json({
      ok: true,
      pendingTokenRequest: serializeTokenRequest(created.id, {
        memberUid: uid,
        adminUid: user.uid,
        amount,
        reason,
        status: "pending",
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (message === "ALREADY_PENDING") {
      return NextResponse.json(
        { error: "This member already has an unpaid token request", code: "ALREADY_PENDING" },
        { status: 409 }
      );
    }
    console.error("POST token-requests", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
