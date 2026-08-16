import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { reassignItsNumber, releaseItsNumber } from "@/lib/its-claim";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { uid } = await params;
  let body: { action?: unknown; itsNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "").toLowerCase();

  try {
    if (action === "release") {
      const result = await releaseItsNumber(uid);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: uid,
        action: "its.release",
        meta: { itsNumber: result.itsNumber },
      });
      return NextResponse.json({ ok: true, itsNumber: null, released: result.itsNumber });
    }

    if (action === "reassign") {
      const result = await reassignItsNumber(uid, String(body.itsNumber ?? ""));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: uid,
        action: "its.reassign",
        meta: { itsNumber: result.itsNumber },
      });
      return NextResponse.json({ ok: true, itsNumber: result.itsNumber });
    }

    return NextResponse.json({ error: "action must be release or reassign" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/admin/users/[uid]/its error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
