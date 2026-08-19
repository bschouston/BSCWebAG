import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  deleteCatalogItem,
  listSkillLevels,
  listSports,
  upsertCatalogItem,
} from "@/lib/sports-catalog-admin";
import { slugifyCatalogLabel } from "@/lib/sports-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  try {
    const [sports, skillLevels] = await Promise.all([
      listSports(false),
      listSkillLevels(false),
    ]);
    return NextResponse.json({ sports, skillLevels });
  } catch (err) {
    console.error("GET /api/admin/sports-catalog error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  let body: {
    kind?: unknown;
    slug?: unknown;
    label?: unknown;
    sortOrder?: unknown;
    active?: unknown;
    id?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind === "skill" ? "skill" : body.kind === "sport" ? "sport" : null;
  if (!kind) {
    return NextResponse.json({ error: "kind must be sport or skill" }, { status: 400 });
  }
  const label = String(body.label ?? "").trim();
  if (!label) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }
  const slug = slugifyCatalogLabel(String(body.slug ?? label));
  if (!slug) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const item = await upsertCatalogItem(kind, {
    id: typeof body.id === "string" ? body.id : slug,
    slug,
    label,
    sortOrder: Number(body.sortOrder) || 0,
    active: body.active !== false,
  });
  return NextResponse.json({ item });
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  let body: { kind?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind === "skill" ? "skill" : body.kind === "sport" ? "sport" : null;
  const id = typeof body.id === "string" ? body.id : "";
  if (!kind || !id) {
    return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  }
  await deleteCatalogItem(kind, id);
  return NextResponse.json({ ok: true });
}
