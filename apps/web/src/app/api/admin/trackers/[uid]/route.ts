import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** Enable/disable a tracker account or reset its password. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();
  const { uid } = await params;

  const userDoc = await adminDb.collection("users").doc(uid).get();
  if (!userDoc.exists || (userDoc.data() as any)?.role !== "TRACKER") {
    return NextResponse.json({ error: "Tracker account not found" }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const updates: { disabled?: boolean; password?: string } = {};

    if (body.disabled !== undefined) updates.disabled = Boolean(body.disabled);
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
      updates.password = password;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    await adminAuth.updateUser(uid, updates);
    if (updates.disabled !== undefined) {
      await adminDb.collection("users").doc(uid).update({
        isActive: !updates.disabled,
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update tracker account error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
