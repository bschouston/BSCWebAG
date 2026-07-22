import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import {
  getPlayerDeleteBlockersFromContext,
  loadTournamentDeleteContext,
  playerAppearsInPlayLog,
} from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; playerId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, playerId } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName ?? "").trim();
    if (!displayName) {
      return NextResponse.json({ error: "displayName cannot be empty" }, { status: 400 });
    }
    updates.displayName = displayName;
  }
  if (body.number !== undefined) updates.number = body.number ?? null;
  if (body.teamId !== undefined) updates.teamId = body.teamId || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("players")
    .doc(playerId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  await ref.update(updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; playerId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, playerId } = await params;
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const playerRef = tournamentRef.collection("players").doc(playerId);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  const player = playerSnap.data() as { teamId?: string | null };

  const ctx = await loadTournamentDeleteContext(adminDb, tournamentId);
  const statsSnap = await tournamentRef.collection("playerStats").doc(playerId).get();
  const matchesPlayed = Number(
    (statsSnap.data() as { matchesPlayed?: number } | undefined)?.matchesPlayed ?? 0
  );
  const inPlayLog = await playerAppearsInPlayLog(
    adminDb,
    tournamentId,
    playerId,
    ctx.matches.map((m) => m.id)
  );
  const blockers = getPlayerDeleteBlockersFromContext(ctx, player, {
    inPlayLog,
    matchesPlayed,
  });
  if (blockers.length) {
    return NextResponse.json(
      { error: "Cannot delete player", blockers },
      { status: 409 }
    );
  }

  const batch = adminDb.batch();
  batch.delete(playerRef);
  batch.delete(tournamentRef.collection("playersPrivate").doc(playerId));
  batch.delete(tournamentRef.collection("playerStats").doc(playerId));
  await batch.commit();
  return NextResponse.json({ ok: true });
}
