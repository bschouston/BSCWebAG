import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { eventId } = await params;
  const adminDb = getAdminDb();

  await adminDb.collection("events").doc(eventId).update({
    registrationsClosedAt: FieldValue.delete(),
    isPublic: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
