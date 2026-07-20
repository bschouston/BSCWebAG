import { NextRequest, NextResponse } from "next/server";
import { listSportContainers } from "@bsc/shared";
import { requireTrackerAdmin } from "../../../lib/server-auth";
import {
  createSportTracker,
  listRegisteredTrackers,
} from "../../../lib/sport-tracker-registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireTrackerAdmin(req);
  if (error) return error;

  try {
    const trackers = await listRegisteredTrackers();
    const containerTypes = listSportContainers().map((c) => ({
      containerType: c.sport,
      name: c.name,
      matchFormat: c.matchFormat,
      defaultSport: c.sport,
      defaultId: c.id,
      periodLabel: c.periodLabel,
    }));
    return NextResponse.json({ trackers, containerTypes });
  } catch (err) {
    console.error("List sport trackers failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireTrackerAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    containerType?: string;
    name?: string;
    sport?: string;
    version?: string;
  };

  try {
    const tracker = await createSportTracker({
      containerType: String(body.containerType ?? ""),
      name: String(body.name ?? ""),
      sport: body.sport,
      version: body.version,
      createdBy: user.uid,
    });
    return NextResponse.json({ tracker }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tracker";
    const status =
      message.includes("already exists") ||
      message.includes("already used") ||
      message.includes("Unknown container") ||
      message.includes("required") ||
      message.includes("Sport slug")
        ? 400
        : 500;
    if (status === 500) console.error("Create sport tracker failed", err);
    return NextResponse.json({ error: message }, { status });
  }
}
