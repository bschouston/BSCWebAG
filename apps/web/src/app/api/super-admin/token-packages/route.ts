import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { normalizePackageCardColor } from "@/lib/token-packages";

export const dynamic = "force-dynamic";

function serializeTs(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function mapPackage(id: string, data: Record<string, unknown>) {
  return {
    id,
    tokenAmount: Number(data.tokenAmount) || 0,
    priceCents: Number(data.priceCents) || 0,
    currency: String(data.currency || "usd"),
    active: data.active !== false,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    label: typeof data.label === "string" ? data.label : null,
    cardColor: normalizePackageCardColor(data.cardColor),
    createdAt: serializeTs(data.createdAt),
    updatedAt: serializeTs(data.updatedAt),
  };
}

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection("tokenPackages").orderBy("sortOrder", "asc").get();
    const packages = snap.docs.map((d) => mapPackage(d.id, d.data() as Record<string, unknown>));
    return NextResponse.json({ packages });
  } catch (err) {
    console.error("GET /api/super-admin/token-packages error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireSuperAdmin(request);
  if (error || !user) return error;

  let body: {
    tokenAmount?: unknown;
    priceCents?: unknown;
    currency?: unknown;
    active?: unknown;
    sortOrder?: unknown;
    label?: unknown;
    cardColor?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tokenAmount = Number(body.tokenAmount);
  const priceCents = Number(body.priceCents);
  const currency = String(body.currency || "usd").toLowerCase();
  const active = body.active !== false;
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const cardColor = normalizePackageCardColor(body.cardColor);

  if (!Number.isInteger(tokenAmount) || tokenAmount <= 0) {
    return NextResponse.json(
      { error: "tokenAmount must be a positive whole number" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json(
      { error: "priceCents must be a non-negative integer" },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const ref = adminDb.collection("tokenPackages").doc();
    const now = Timestamp.now();
    const doc = {
      tokenAmount,
      priceCents,
      currency,
      active,
      sortOrder,
      label: label || null,
      cardColor,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(doc);
    await writeAdminAudit({
      adminUid: user.uid,
      targetUid: user.uid,
      action: "token_packages.create",
      meta: { packageId: ref.id, tokenAmount, priceCents },
    });
    return NextResponse.json({
      ok: true,
      package: mapPackage(ref.id, doc as unknown as Record<string, unknown>),
    });
  } catch (err) {
    console.error("POST /api/super-admin/token-packages error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
