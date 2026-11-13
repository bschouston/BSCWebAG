import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import { createSeriesOccurrence, SeriesOccurrenceError } from "@/lib/weekly-series";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!date) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const result = await createSeriesOccurrence(id, date);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof SeriesOccurrenceError) {
      if (err.code === "NOT_FOUND") {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err.code === "DATE_TAKEN") {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
      }
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("POST weekly-series occurrences", err);
    return NextResponse.json({ error: "Failed to add event" }, { status: 500 });
  }
}
