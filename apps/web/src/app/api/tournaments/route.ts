import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin, verifyAuth } from "@/lib/auth/server-auth";
import {
  VOLLEYBALL_LIVE_SHEET_IFRAME_HTML,
  isVolleyballStatTrackerId,
} from "@/lib/live-volleyball-sheet";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Allow admin/super-admin to list all; tracker/member can list ACTIVE only (for later tracker app).
  const decoded = await verifyAuth(req);
  const role = (decoded as any)?.role as string | undefined;

  const adminDb = getAdminDb();
  const status = new URL(req.url).searchParams.get("status");

  try {
    // Avoid requiring composite indexes by not combining where(status) + orderBy(createdAt).
    // We fetch and sort in-memory instead.
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      adminDb.collection("tournaments");

    const isAdmin =
      role === "ADMIN" || role === "SUPER_ADMIN" || role === "TRACKER";

    if (!isAdmin) {
      // unauthenticated/public: only active
      query = adminDb
        .collection("tournaments")
        .where("status", "==", "ACTIVE");
    } else if (status) {
      query = adminDb
        .collection("tournaments")
        .where("status", "==", status);
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

    tournaments.sort((a: any, b: any) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
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
    // Creating a tournament should create/publish a Live page by default.
    const status = String(body?.status ?? "ACTIVE").trim();
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
      publicLiveEnabled: status === "ACTIVE",
      publicIframeEmbedHtml: isVolleyballStatTrackerId(statTrackerId)
        ? VOLLEYBALL_LIVE_SHEET_IFRAME_HTML
        : null,
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

