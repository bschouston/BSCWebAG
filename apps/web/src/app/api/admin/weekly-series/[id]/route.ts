import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  deleteWeeklySeries,
  serializeWeeklySeries,
  setWeeklySeriesAdminLabel,
  setWeeklySeriesPaused,
} from "@/lib/weekly-series";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await params;
  const snap = await getAdminDb().collection("weeklySeries").doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Series not found" }, { status: 404 });
  return NextResponse.json(serializeWeeklySeries(snap.id, snap.data() ?? {}));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasPaused = typeof body.paused === "boolean";
  const hasAdminLabel = "adminLabel" in body;

  if (!hasPaused && !hasAdminLabel) {
    return NextResponse.json(
      { error: "Provide paused (boolean) and/or adminLabel (string or null)" },
      { status: 400 }
    );
  }

  try {
    const result: Record<string, unknown> = { ok: true };
    if (hasPaused) {
      const pauseResult = await setWeeklySeriesPaused(id, body.paused as boolean);
      result.paused = body.paused;
      Object.assign(result, pauseResult);
    }
    if (hasAdminLabel) {
      const raw = body.adminLabel;
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json({ error: "adminLabel must be a string or null" }, { status: 400 });
      }
      const labelResult = await setWeeklySeriesAdminLabel(id, raw as string | null);
      result.adminLabel = labelResult.adminLabel;
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    console.error("PATCH weekly-series", err);
    return NextResponse.json({ error: "Failed to update series" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await deleteWeeklySeries(id, { adminUid: user.uid });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    console.error("DELETE weekly-series", err);
    return NextResponse.json({ error: "Failed to delete series" }, { status: 500 });
  }
}
