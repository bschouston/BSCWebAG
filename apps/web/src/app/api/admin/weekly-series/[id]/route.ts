import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  deleteWeeklySeries,
  serializeWeeklySeries,
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
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be true or false" }, { status: 400 });
  }
  try {
    const result = await setWeeklySeriesPaused(id, body.paused);
    return NextResponse.json({ ok: true, paused: body.paused, ...result });
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
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await params;
  try {
    const result = await deleteWeeklySeries(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    console.error("DELETE weekly-series", err);
    return NextResponse.json({ error: "Failed to delete series" }, { status: 500 });
  }
}
