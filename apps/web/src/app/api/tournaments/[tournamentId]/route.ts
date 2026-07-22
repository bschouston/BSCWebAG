import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { StandingsConfigSchema } from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { isPublicTournamentTabId } from "@/lib/public-tournament-tabs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { tournamentId } = await params;
  // If this request includes an Authorization header, treat it as an admin-only read.
  // This avoids relying on custom role claims being present in verifyAuth().
  const hasAuthHeader = !!req.headers.get("authorization");
  if (hasAuthHeader) {
    const { error } = await requireAdmin(req);
    if (error) return error;
  }

  const adminDb = getAdminDb();
  const snap = await adminDb.collection("tournaments").doc(tournamentId).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = snap.data() as any;
  const isAdmin = hasAuthHeader;

  // Public can only view active + live enabled tournaments.
  if (!isAdmin) {
    const liveEnabled = data.publicLiveEnabled !== false; // default true for older docs
    if (data.status !== "ACTIVE" || !liveEnabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json({
    tournament: {
      id: snap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { tournamentId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const updates: Record<string, unknown> = {};

  if (body.publicIframeEmbedHtml !== undefined) {
    if (body.publicIframeEmbedHtml !== null && typeof body.publicIframeEmbedHtml !== "string") {
      return NextResponse.json({ error: "publicIframeEmbedHtml must be a string or null" }, { status: 400 });
    }
    updates.publicIframeEmbedHtml = body.publicIframeEmbedHtml;
  }

  if (body.publicLiveEnabled !== undefined) {
    if (typeof body.publicLiveEnabled !== "boolean") {
      return NextResponse.json({ error: "publicLiveEnabled must be boolean" }, { status: 400 });
    }
    updates.publicLiveEnabled = body.publicLiveEnabled;
  }

  if (body.statPointWeights !== undefined) {
    const weights = body.statPointWeights;
    if (
      weights === null ||
      typeof weights !== "object" ||
      Array.isArray(weights) ||
      Object.values(weights).some((v) => typeof v !== "number" || !Number.isFinite(v))
    ) {
      return NextResponse.json(
        { error: "statPointWeights must be a map of statKey to number" },
        { status: 400 }
      );
    }
    updates.statPointWeights = weights;
  }

  if (body.publicTabs !== undefined) {
    if (!Array.isArray(body.publicTabs)) {
      return NextResponse.json({ error: "publicTabs must be an array of tab ids" }, { status: 400 });
    }
    if (body.publicTabs.length === 0) {
      return NextResponse.json({ error: "publicTabs must include at least one tab" }, { status: 400 });
    }
    if (!body.publicTabs.every((t: unknown) => typeof t === "string" && isPublicTournamentTabId(t))) {
      return NextResponse.json({ error: "publicTabs contains invalid tab id" }, { status: 400 });
    }
    updates.publicTabs = body.publicTabs;
  }

  if (body.standingsConfig !== undefined) {
    const parsed = StandingsConfigSchema.safeParse(body.standingsConfig);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid standingsConfig", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    updates.standingsConfig = parsed.data;
  }

  if (body.status !== undefined) {
    const allowed = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
    if (typeof body.status !== "string" || !allowed.includes(body.status as (typeof allowed)[number])) {
      return NextResponse.json(
        { error: "status must be DRAFT, ACTIVE, COMPLETED, or ARCHIVED" },
        { status: 400 }
      );
    }
    updates.status = body.status;
    // Archiving should take the tournament off the public live list.
    if (body.status === "ARCHIVED") {
      updates.publicLiveEnabled = false;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updatedAt = Timestamp.now();

  const adminDb = getAdminDb();
  await adminDb.collection("tournaments").doc(tournamentId).update(updates);
  return NextResponse.json({ ok: true });
}

