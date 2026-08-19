import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { sendTokenRequestCancelledEmail } from "@/lib/email";
import { TOKEN_REQUESTS_COLLECTION, serializeTokenRequest } from "@/lib/token-request";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string; id: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;
  const { uid, id } = await params;

  try {
    const adminDb = getAdminDb();
    const result = await adminDb.runTransaction(async (t) => {
      const requestRef = adminDb.collection(TOKEN_REQUESTS_COLLECTION).doc(id);
      const snap = await t.get(requestRef);
      if (!snap.exists) throw new Error("NOT_FOUND");
      const rec = serializeTokenRequest(snap.id, snap.data() ?? {});
      if (rec.memberUid !== uid) throw new Error("NOT_FOUND");
      if (rec.status === "cancelled") return rec;
      if (rec.status !== "pending") throw new Error("NOT_PENDING");
      t.update(requestRef, {
        status: "cancelled",
        resolvedAt: FieldValue.serverTimestamp(),
        cancelledByUid: user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.update(adminDb.collection("users").doc(uid), {
        pendingTokenRequestId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ...rec, status: "cancelled" as const };
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: "tokens.request_cancel",
      meta: { requestId: id, amount: result.amount, reason: result.reason },
    });

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const ud = userSnap.data() ?? {};
    if (typeof ud.email === "string") {
      const name = [ud.firstName, ud.lastName].filter(Boolean).join(" ") || "Member";
      sendTokenRequestCancelledEmail({
        to: ud.email,
        name,
        amount: result.amount,
        reason: result.reason,
      }).catch((e) => console.error("token request cancelled email:", e));
    }

    return NextResponse.json({ ok: true, pendingTokenRequest: null, cancelled: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (message === "NOT_PENDING") {
      return NextResponse.json({ error: "Only a pending request can be cancelled" }, { status: 409 });
    }
    console.error("POST token-requests cancel", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
