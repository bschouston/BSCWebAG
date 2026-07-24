import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  listTrackerAuditLogs,
  type TrackerAuditSortField,
} from "@/lib/tracker-admin";

export const dynamic = "force-dynamic";

const SORT_FIELDS = new Set<TrackerAuditSortField>([
  "createdAt",
  "userEmail",
  "action",
  "tournamentName",
  "teamName",
  "statLabel",
]);

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const pageSizeRaw = Number(params.get("pageSize") ?? "50");
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 50;
  const sortFieldParam = params.get("sortField") ?? "createdAt";
  const sortField = SORT_FIELDS.has(sortFieldParam as TrackerAuditSortField)
    ? (sortFieldParam as TrackerAuditSortField)
    : "createdAt";
  const sortDirParam = params.get("sortDir");
  const sortDir =
    sortDirParam === "asc" || sortDirParam === "desc"
      ? sortDirParam
      : sortField === "createdAt"
        ? "desc"
        : "asc";

  try {
    const adminDb = getAdminDb();
    const result = await listTrackerAuditLogs(adminDb, {
      email: params.get("email") ?? undefined,
      tournamentId: params.get("tournamentId") ?? undefined,
      matchId: params.get("matchId") ?? undefined,
      action: params.get("action") ?? undefined,
      sortField,
      sortDir,
      pageSize,
      cursor: params.get("cursor") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load tracker audit logs";
    console.error("Tracker audit list failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
