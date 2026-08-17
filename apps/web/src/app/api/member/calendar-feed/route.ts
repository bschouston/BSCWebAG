import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/server-auth";
import { calendarFeedPayload, ensureCalendarFeedToken } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const token = await ensureCalendarFeedToken(decoded.uid, false);
    return NextResponse.json(calendarFeedPayload(token));
  } catch (error) {
    console.error("GET /api/member/calendar-feed", error);
    return NextResponse.json({ error: "Failed to load calendar feed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let rotate = false;
  try {
    const body = await request.json().catch(() => ({}));
    rotate = Boolean((body as { rotate?: unknown }).rotate);
  } catch {
    rotate = false;
  }
  try {
    const token = await ensureCalendarFeedToken(decoded.uid, rotate);
    return NextResponse.json(calendarFeedPayload(token));
  } catch (error) {
    console.error("POST /api/member/calendar-feed", error);
    return NextResponse.json({ error: "Failed to update calendar feed" }, { status: 500 });
  }
}
