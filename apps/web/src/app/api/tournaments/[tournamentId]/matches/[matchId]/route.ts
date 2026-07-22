import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { deleteTournamentMatch } from "@/lib/tournament-stats-rebuild";
import {
  countActiveLocksForMatch,
  countPlaysForMatch,
  getMatchDeleteBlockers,
} from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId)
    .get();
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  return NextResponse.json({ match: { id: snap.id, ...snap.data() } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const updates: Record<string, unknown> = {};
  if (body.teamAId !== undefined) updates.teamAId = String(body.teamAId);
  if (body.teamBId !== undefined) updates.teamBId = String(body.teamBId);
  if (body.scheduledAt !== undefined) {
    updates.scheduledAt = body.scheduledAt
      ? Timestamp.fromDate(new Date(body.scheduledAt))
      : null;
  }
  if (body.courtNumber !== undefined) {
    if (body.courtNumber === null || body.courtNumber === "") {
      updates.courtNumber = null;
    } else {
      const court =
        typeof body.courtNumber === "number"
          ? body.courtNumber
          : Number(String(body.courtNumber).trim());
      if (!Number.isFinite(court) || court < 1) {
        return NextResponse.json({ error: "Invalid courtNumber" }, { status: 400 });
      }
      updates.courtNumber = Math.floor(court);
    }
  }
  if (body.status !== undefined) {
    if (!["UPCOMING", "IN_PROGRESS", "COMPLETED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const adminDb = getAdminDb();
    const { tournamentId, matchId } = await params;
    const matchRef = adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const match = matchSnap.data() as Record<string, unknown>;
    const [activeLockCount, playCount] = await Promise.all([
      countActiveLocksForMatch(adminDb, tournamentId, matchId),
      countPlaysForMatch(adminDb, tournamentId, matchId),
    ]);
    const blockers = getMatchDeleteBlockers(
      {
        status: match.status as string | undefined,
        playSeq: match.playSeq as number | undefined,
        startedAt: match.startedAt,
        completedAt: match.completedAt,
        lastPlayAt: match.lastPlayAt,
        winnerTeamId: match.winnerTeamId as string | null | undefined,
      },
      { activeLockCount, playCount }
    );
    if (blockers.length) {
      return NextResponse.json(
        { error: "Cannot delete match", blockers },
        { status: 409 }
      );
    }
    const result = await deleteTournamentMatch(adminDb, tournamentId, matchId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete match";
    const status = message === "Match not found" ? 404 : 500;
    console.error("Delete match error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
