import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  getTrackerAccessConfig,
  listAuthorizedTrackerEmails,
  setTrackerAccessConfig,
} from "@/lib/tracker-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const [config, emails] = await Promise.all([
    getTrackerAccessConfig(adminDb),
    listAuthorizedTrackerEmails(adminDb),
  ]);

  return NextResponse.json({ ...config, authorizedEmails: emails });
}

export async function PATCH(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { publicGoogleLogin?: boolean };
  if (typeof body.publicGoogleLogin !== "boolean") {
    return NextResponse.json({ error: "publicGoogleLogin boolean required" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  await setTrackerAccessConfig(adminDb, body.publicGoogleLogin, user.uid);
  return NextResponse.json({ ok: true, publicGoogleLogin: body.publicGoogleLogin });
}
