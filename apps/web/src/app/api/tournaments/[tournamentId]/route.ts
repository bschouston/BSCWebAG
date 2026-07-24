import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  PlayoffBracketDocSchema,
  PlayoffConfigSchema,
  StandingsConfigSchema,
  livePageTitle,
  registrationNavTitle,
} from "@bsc/shared";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { isPublicTournamentTabId } from "@/lib/public-tournament-tabs";
import {
  hasPublishedPlayoffMatches,
  isTournamentPlayoffsActive,
} from "@/lib/tournament-delete-context";

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

  let rawName = String(data.name ?? "Tournament");
  let registrationFormType: string | undefined;
  const eventId = typeof data.eventId === "string" ? data.eventId.trim() : "";
  if (eventId) {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    const eventData = eventSnap.data() as
      | { title?: unknown; registrationFormType?: unknown }
      | undefined;
    const eventTitle = String(eventData?.title ?? "").trim();
    if (eventTitle) rawName = eventTitle;
    if (typeof eventData?.registrationFormType === "string") {
      registrationFormType = eventData.registrationFormType;
    }
  }

  return NextResponse.json({
    tournament: {
      id: snap.id,
      ...data,
      name: livePageTitle(
        registrationNavTitle(rawName, registrationFormType),
        data.statTrackerId
      ),
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

  if (body.enableStatTrackingTeams !== undefined) {
    if (typeof body.enableStatTrackingTeams !== "boolean") {
      return NextResponse.json(
        { error: "enableStatTrackingTeams must be boolean" },
        { status: 400 }
      );
    }
    updates.enableStatTrackingTeams = body.enableStatTrackingTeams;
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

  if (body.publicDefaultTab !== undefined) {
    if (body.publicDefaultTab !== null && typeof body.publicDefaultTab !== "string") {
      return NextResponse.json({ error: "publicDefaultTab must be a tab id or null" }, { status: 400 });
    }
    if (
      body.publicDefaultTab !== null &&
      !isPublicTournamentTabId(String(body.publicDefaultTab))
    ) {
      return NextResponse.json({ error: "publicDefaultTab contains invalid tab id" }, { status: 400 });
    }
    if (body.publicDefaultTab != null && Array.isArray(updates.publicTabs)) {
      if (!(updates.publicTabs as string[]).includes(String(body.publicDefaultTab))) {
        return NextResponse.json(
          { error: "publicDefaultTab must be one of the enabled publicTabs" },
          { status: 400 }
        );
      }
    }
    updates.publicDefaultTab = body.publicDefaultTab;
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

  if (body.playoffConfig !== undefined) {
    const parsed = PlayoffConfigSchema.safeParse(body.playoffConfig);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid playoffConfig", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    updates.playoffConfig = parsed.data;
  }

  if (body.playoffBracket !== undefined) {
    if (body.playoffBracket === null) {
      updates.playoffBracket = FieldValue.delete();
    } else {
      const parsed = PlayoffBracketDocSchema.safeParse(body.playoffBracket);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid playoffBracket", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      updates.playoffBracket = parsed.data;
    }
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

  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  if (updates.standingsConfig !== undefined) {
    const playoffsActive = await isTournamentPlayoffsActive(adminDb, tournamentId);
    if (playoffsActive) {
      return NextResponse.json(
        {
          error:
            "Standings are locked while playoffs are active — delete playoffs to edit standings",
        },
        { status: 409 }
      );
    }
  }

  if (updates.playoffBracket !== undefined) {
    const playoffMatchesExist = await hasPublishedPlayoffMatches(adminDb, tournamentId);
    if (playoffMatchesExist) {
      return NextResponse.json(
        {
          error:
            "Playoff bracket cannot be changed after matches are scheduled — delete playoffs first",
        },
        { status: 409 }
      );
    }
  }

  updates.updatedAt = Timestamp.now();

  await tournamentRef.update(updates);
  return NextResponse.json({ ok: true });
}

