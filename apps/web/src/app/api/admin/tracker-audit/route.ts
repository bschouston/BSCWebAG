import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { listTrackerAuditLogs } from "@/lib/tracker-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const adminDb = getAdminDb();
  const logs = await listTrackerAuditLogs(adminDb, {
    email: params.get("email") ?? undefined,
    tournamentId: params.get("tournamentId") ?? undefined,
    matchId: params.get("matchId") ?? undefined,
    action: params.get("action") ?? undefined,
    sort: params.get("sort") === "time" ? "time" : "email",
    limit: Number(params.get("limit") ?? "500"),
  });

  return NextResponse.json({ logs });
}
