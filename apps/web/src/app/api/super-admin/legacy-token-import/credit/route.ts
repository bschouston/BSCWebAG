import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { creditLegacyEntitlement } from "@/lib/legacy-token-migration";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  try {
    const body = await request.json();
    const its = typeof body.its === "string" ? body.its : "";
    const requireEmailMatch = body.requireEmailMatch === true;
    if (!its) {
      return NextResponse.json({ error: "ITS is required" }, { status: 400 });
    }

    const result = await creditLegacyEntitlement({
      its,
      actor: "admin",
      actorUid: user.uid,
      requireEmailMatch,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Credit failed";
    console.error("POST legacy-token-import/credit", err);
    const status = /live|retired|ITS|Email|Already|found|claimed/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
