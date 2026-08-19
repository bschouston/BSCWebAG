import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getAdminDb().collection("homepageLightbox").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    const data = doc.data() ?? {};
    return NextResponse.json({
      id: doc.id,
      title: data.title ?? "",
      sport: data.sport ?? "",
      era: data.era ?? "",
      imageUrl: data.imageUrl ?? null,
      sortOrder: data.sortOrder ?? 0,
      enabled: data.enabled !== false,
    });
  } catch (error) {
    console.error("homepage lightbox GET id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const ref = getAdminDb().collection("homepageLightbox").doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (body.title !== undefined) update.title = String(body.title).trim();
    if (body.sport !== undefined) update.sport = String(body.sport).trim();
    if (body.era !== undefined) update.era = String(body.era).trim();
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
    if (typeof body.sortOrder === "number") update.sortOrder = body.sortOrder;
    if (typeof body.enabled === "boolean") update.enabled = body.enabled;

    await ref.update(update);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("homepage lightbox PUT", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const { id } = await params;
    await getAdminDb().collection("homepageLightbox").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("homepage lightbox DELETE", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
