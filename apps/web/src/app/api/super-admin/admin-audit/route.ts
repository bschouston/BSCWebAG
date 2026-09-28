import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import {
  ADMIN_AUDIT_ACTION_LABELS,
  adminAuditRowsToCsv,
  exportAdminAuditLogs,
  listAdminAuditLogs,
} from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function parseFilters(params: URLSearchParams) {
  const action = params.get("action")?.trim() || undefined;
  const adminUid = params.get("adminUid")?.trim() || undefined;
  const targetUid = params.get("targetUid")?.trim() || undefined;
  const from = params.get("from");
  const to = params.get("to");
  return { action, adminUid, targetUid, from, to };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const filters = parseFilters(params);
  const format = params.get("format");

  try {
    const adminDb = getAdminDb();

    if (format === "csv") {
      const { rows, truncated } = await exportAdminAuditLogs(adminDb, filters);
      const csv = adminAuditRowsToCsv(rows, truncated);
      const day = new Date().toISOString().slice(0, 10);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="admin-audit-${day}.csv"`,
          "X-Export-Truncated": truncated ? "1" : "0",
          "X-Export-Count": String(rows.length),
        },
      });
    }

    const pageSizeRaw = Number(params.get("pageSize") ?? "50");
    const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 50;
    const result = await listAdminAuditLogs(adminDb, {
      ...filters,
      pageSize,
      cursor: params.get("cursor") ?? undefined,
    });

    return NextResponse.json({
      ...result,
      actionLabels: ADMIN_AUDIT_ACTION_LABELS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load admin audit log";
    console.error("admin-audit API", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
