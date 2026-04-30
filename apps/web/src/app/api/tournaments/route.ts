import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin, verifyAuth } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Allow admin/super-admin to list all; tracker/member can list ACTIVE only (for later tracker app).
  const decoded = await verifyAuth(req);
  const role = (decoded as any)?.role as string | undefined;

  const adminDb = getAdminDb();
  const status = new URL(req.url).searchParams.get("status");

  try {
    let query = adminDb.collection("tournaments").orderBy("createdAt", "desc");

    const isAdmin =
      role === "ADMIN" || role === "SUPER_ADMIN" || role === "TRACKER";

    if (!isAdmin) {
      // unauthenticated/public: only active
      query = adminDb
        .collection("tournaments")
        .where("status", "==", "ACTIVE")
        .orderBy("createdAt", "desc");
    } else if (status) {
      query = adminDb
        .collection("tournaments")
        .where("status", "==", status)
        .orderBy("createdAt", "desc");
    }

    const snap = await query.get();
    const tournaments = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ tournaments });
  } catch (err) {
    console.error("List tournaments error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  try {
    const body = (await req.json()) as any;
    const name = String(body?.name ?? "").trim();
    const status = String(body?.status ?? "DRAFT").trim();
    const statTrackerId = String(body?.statTrackerId ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!statTrackerId) {
      return NextResponse.json({ error: "statTrackerId is required" }, { status: 400 });
    }

    const now = Timestamp.now();
    const ref = adminDb.collection("tournaments").doc();
    await ref.set({
      name,
      status,
      statTrackerId,
      statTrackerVersion: body?.statTrackerVersion ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
    });

    return NextResponse.json({ id: ref.id });
  } catch (err) {
    console.error("Create tournament error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

