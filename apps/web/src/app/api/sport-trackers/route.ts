import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import { listRegisteredTrackers } from "@/lib/sport-tracker-registry";

export const dynamic = "force-dynamic";

/** Admin list of registered sport trackers (for tournament attach dropdown). */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const trackers = await listRegisteredTrackers();
    return NextResponse.json({ trackers });
  } catch (err) {
    console.error("List sport trackers failed", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
