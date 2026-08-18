import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import {
  getTokenPricingConfig,
  saveTokenPricingConfig,
} from "@/lib/token-pricing-config";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  try {
    const config = await getTokenPricingConfig();
    return NextResponse.json({ config });
  } catch (err) {
    console.error("GET /api/super-admin/token-pricing-config error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  let body: { unitPriceCents?: unknown; currency?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const unitPriceCents = Number(body.unitPriceCents);
  if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
    return NextResponse.json(
      { error: "unitPriceCents must be a positive whole number (cents per token)" },
      { status: 400 }
    );
  }

  const currency = String(body.currency || "usd").toLowerCase();

  try {
    await saveTokenPricingConfig({ unitPriceCents, currency });
    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: user.uid,
      action: "token_pricing_config.update",
      meta: { unitPriceCents, currency },
    });
    const config = await getTokenPricingConfig();
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    console.error("PUT /api/super-admin/token-pricing-config error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
