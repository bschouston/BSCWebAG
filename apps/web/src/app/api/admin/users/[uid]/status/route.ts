import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetRole = snap.data()?.role ?? "MEMBER";
    if (targetRole === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Cannot change a Super Admin account" }, { status: 403 });
    }

    await ref.update({
      isActive: body.isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: uid,
      action: body.isActive ? "account.enable" : "account.disable",
    });

    return NextResponse.json({ ok: true, isActive: body.isActive });
  } catch (err) {
    console.error("PATCH /api/admin/users/[uid]/status error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
