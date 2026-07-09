import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { addAuthorizedTrackerEmail, removeAuthorizedTrackerEmail } from "@/lib/tracker-admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; label?: string };
    const adminDb = getAdminDb();
    await addAuthorizedTrackerEmail(
      adminDb,
      String(body.email ?? ""),
      user.uid,
      body.label
    );
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add email";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const email = new URL(req.url).searchParams.get("email") ?? "";
  if (!email.trim()) {
    return NextResponse.json({ error: "email query param required" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  await removeAuthorizedTrackerEmail(adminDb, email);
  return NextResponse.json({ ok: true });
}
