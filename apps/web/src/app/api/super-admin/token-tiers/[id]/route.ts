import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

function serializeTs(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function mapTier(id: string, data: Record<string, unknown>) {
  return {
    id,
    tokenAmount: Number(data.tokenAmount) || 0,
    priceCents: Number(data.priceCents) || 0,
    currency: String(data.currency || "usd"),
    active: data.active !== false,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    label: typeof data.label === "string" ? data.label : null,
    createdAt: serializeTs(data.createdAt),
    updatedAt: serializeTs(data.updatedAt),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if ("tokenAmount" in body) {
    const tokenAmount = Number(body.tokenAmount);
    if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) {
      return NextResponse.json({ error: "tokenAmount must be a positive whole number" }, { status: 400 });
    }
    updates.tokenAmount = tokenAmount;
  }
  if ("priceCents" in body) {
    const priceCents = Number(body.priceCents);
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: "priceCents must be a non-negative integer" }, { status: 400 });
    }
    updates.priceCents = priceCents;
  }
  if ("currency" in body) {
    updates.currency = String(body.currency || "usd").toLowerCase();
  }
  if ("active" in body) {
    updates.active = Boolean(body.active);
  }
  if ("sortOrder" in body) {
    updates.sortOrder = Number(body.sortOrder) || 0;
  }
  if ("label" in body) {
    updates.label =
      typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  }

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("tokenTopUpTiers").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }
    await ref.update(updates);
    const next = await ref.get();
    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: user.uid,
      action: "token_tiers.update",
      meta: { tierId: id, updates: Object.keys(updates) },
    });
    return NextResponse.json({
      ok: true,
      tier: mapTier(id, next.data() as Record<string, unknown>),
    });
  } catch (err) {
    console.error("PATCH /api/super-admin/token-tiers/[id] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  const { id } = await params;
  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("tokenTopUpTiers").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }
    // Soft-delete: deactivate (keeps history for replenish matching audits)
    await ref.update({
      active: false,
      updatedAt: Timestamp.now(),
    });
    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: user.uid,
      action: "token_tiers.deactivate",
      meta: { tierId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/super-admin/token-tiers/[id] error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
