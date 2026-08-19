import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import { createWeeklySeries, generateAllSeriesHorizons, listWeeklySeries } from "@/lib/weekly-series";
import type { DurationUnit } from "@/lib/chicago-time";

export const dynamic = "force-dynamic";

function offset(amount: unknown, unit: unknown): { amount: number; unit: DurationUnit } {
  const u = unit === "hours" || unit === "minutes" || unit === "days" ? unit : "hours";
  return { amount: Math.max(0, Number(amount) || 0), unit: u };
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const sportId = String(body.sportId ?? "").trim();
  const firstStartLocal = String(body.firstStartLocal ?? body.startTime ?? "");
  const endLocal = String(body.endTime ?? "");
  if (!title || !sportId || !firstStartLocal) {
    return NextResponse.json({ error: "title, sportId, and start time are required" }, { status: 400 });
  }

  const startMs = Date.parse(firstStartLocal);
  const endMs = Date.parse(endLocal);
  const durationMinutes =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? Math.round((endMs - startMs) / 60000)
      : Number(body.durationMinutes) || 90;

  const weekdaysRaw = Array.isArray(body.weekdays) ? body.weekdays.map((n) => Number(n)) : [];
  const firstDate = new Date(firstStartLocal);
  const defaultWd = Number.isNaN(firstDate.getDay()) ? 5 : firstDate.getDay();
  const weekdays = (weekdaysRaw.length ? weekdaysRaw : [defaultWd]).filter((d) => d >= 0 && d <= 6);

  const minCapacity = Math.max(1, Number(body.minCapacity) || 1);
  const maxCapacity = Math.max(minCapacity, Number(body.maxCapacity ?? body.capacity) || minCapacity);
  const tokensMax = Math.max(0, Number(body.tokensMax) || 0);
  const tokensMin = Math.max(0, Number(body.tokensMin) || 0);

  try {
    const result = await createWeeklySeries(user.uid, {
      title,
      description: typeof body.description === "string" ? body.description : null,
      sportId,
      locationId: typeof body.locationId === "string" ? body.locationId : null,
      addressUrl: typeof body.addressUrl === "string" ? body.addressUrl : null,
      genderPolicy:
        body.genderPolicy === "MALE_ONLY" || body.genderPolicy === "FEMALE_ONLY"
          ? body.genderPolicy
          : "ALL",
      isPublic: body.isPublic !== false,
      status: body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
      weekdays,
      localStartTime: firstStartLocal.includes("T") ? firstStartLocal.split("T")[1].slice(0, 5) : "20:00",
      durationMinutes,
      firstStartLocal,
      untilLocal: typeof body.untilLocal === "string" && body.untilLocal ? body.untilLocal : null,
      rsvpOpens: offset(body.rsvpOpensAmount, body.rsvpOpensUnit),
      rsvpCloses: offset(body.rsvpClosesAmount, body.rsvpClosesUnit),
      minCapacity,
      maxCapacity,
      tokensMin,
      tokensMax,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
      slug: typeof body.slug === "string" ? body.slug : null,
      teamsEnabled: body.teamsEnabled === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /api/admin/weekly-series", err);
    return NextResponse.json({ error: "Failed to create series" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  if (new URL(request.url).searchParams.get("generate") === "1") {
    const generated = await generateAllSeriesHorizons();
    return NextResponse.json(generated);
  }
  const series = await listWeeklySeries();
  return NextResponse.json({ series });
}
