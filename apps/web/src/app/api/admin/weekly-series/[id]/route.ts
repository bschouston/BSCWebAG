import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import type { DurationUnit } from "@/lib/chicago-time";
import { parseWeeklyTokenHold } from "@/lib/weekly-token-limits";
import {
  deleteWeeklySeries,
  serializeWeeklySeries,
  setWeeklySeriesAdminLabel,
  setWeeklySeriesPaused,
  updateWeeklySeries,
} from "@/lib/weekly-series";

export const dynamic = "force-dynamic";

function offset(amount: unknown, unit: unknown): { amount: number; unit: DurationUnit } {
  const u = unit === "hours" || unit === "minutes" || unit === "days" ? unit : "hours";
  return { amount: Math.max(0, Number(amount) || 0), unit: u };
}

function hasTemplateFields(body: Record<string, unknown>): boolean {
  return (
    typeof body.title === "string" ||
    typeof body.sportId === "string" ||
    typeof body.startTime === "string" ||
    typeof body.localStartTime === "string" ||
    typeof body.endTime === "string" ||
    typeof body.durationMinutes === "number" ||
    Array.isArray(body.weekdays)
  );
}

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

  const hasPaused = typeof body.paused === "boolean";
  const hasAdminLabel = "adminLabel" in body;
  const templateUpdate = hasTemplateFields(body);

  if (!hasPaused && !hasAdminLabel && !templateUpdate) {
    return NextResponse.json(
      {
        error:
          "Provide paused (boolean), adminLabel (string or null), and/or series template fields",
      },
      { status: 400 }
    );
  }

  try {
    const result: Record<string, unknown> = { ok: true };

    if (templateUpdate) {
      const title = String(body.title ?? "").trim();
      const sportId = String(body.sportId ?? "").trim();
      if (!title || !sportId) {
        return NextResponse.json({ error: "title and sportId are required" }, { status: 400 });
      }

      const startLocal = String(body.startTime ?? "");
      const endLocal = String(body.endTime ?? "");
      const startMs = Date.parse(startLocal);
      const endMs = Date.parse(endLocal);
      const durationMinutes =
        Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? Math.round((endMs - startMs) / 60000)
          : Number(body.durationMinutes) || 90;

      const weekdaysRaw = Array.isArray(body.weekdays) ? body.weekdays.map((n) => Number(n)) : [];
      const weekdays = weekdaysRaw.filter((d) => d >= 0 && d <= 6);
      if (weekdays.length === 0) {
        return NextResponse.json({ error: "Select at least one weekday" }, { status: 400 });
      }

      const localStartTime =
        typeof body.localStartTime === "string" && body.localStartTime.trim()
          ? body.localStartTime.trim().slice(0, 5)
          : startLocal.includes("T")
            ? startLocal.split("T")[1].slice(0, 5)
            : "20:00";

      const minCapacity = Math.max(1, Number(body.minCapacity) || 1);
      const maxCapacity = Math.max(
        minCapacity,
        Number(body.maxCapacity ?? body.capacity) || minCapacity
      );

      let tokensMax: number;
      let tokensMin: number;
      try {
        tokensMax = parseWeeklyTokenHold(body.tokensMax ?? 0, "Token hold (max)");
        tokensMin = parseWeeklyTokenHold(body.tokensMin ?? 0, "Token minimum");
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid token hold" },
          { status: 400 }
        );
      }
      if (tokensMin > tokensMax) {
        return NextResponse.json(
          { error: "Token minimum cannot exceed the hold maximum" },
          { status: 400 }
        );
      }

      const updateResult = await updateWeeklySeries(
        id,
        {
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
          localStartTime,
          durationMinutes,
          untilLocal: typeof body.untilLocal === "string" && body.untilLocal ? body.untilLocal : null,
          rsvpOpens: offset(body.rsvpOpensAmount, body.rsvpOpensUnit),
          rsvpCloses: offset(body.rsvpClosesAmount, body.rsvpClosesUnit),
          rsvpCancelCloses:
            body.rsvpCancelSameAsClose === true || body.rsvpCancelSameAsClose === undefined
              ? null
              : offset(body.rsvpCancelClosesAmount, body.rsvpCancelClosesUnit),
          minCapacity,
          maxCapacity,
          tokensMin,
          tokensMax,
          imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
          slug: typeof body.slug === "string" ? body.slug : null,
          teamsEnabled: body.teamsEnabled === true,
        },
        { adminUid: user.uid }
      );
      Object.assign(result, updateResult);
    }

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
    if (
      err instanceof Error &&
      (err.message.includes("Token") ||
        err.message.includes("weekday") ||
        err.message.includes("Select at least"))
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
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
