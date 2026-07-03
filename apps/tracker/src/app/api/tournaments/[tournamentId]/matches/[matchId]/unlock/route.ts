import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../../../lib/server-auth";
import { checkPasscode } from "../../../../../../../lib/tracker-config-server";
import { isValidPasscodeFormat } from "../../../../../../../lib/passcode";
import { sportFromStatTrackerId } from "../../../../../../../lib/match-edit";

export const dynamic = "force-dynamic";

const UNLOCK_WINDOW_MS = 10 * 60 * 1000;

/**
 * Passcode gate for editing locked sets / completed matches.
 *
 * POST { passcode, scope: "set" | "match", setNumber? } — verifies the sport
 * passcode server-side and writes a time-boxed `editUnlock` on the match doc.
 * POST { action: "relock" } — clears the unlock immediately (no passcode).
 *
 * All play/status writes go through Admin SDK APIs that check `editUnlock`,
 * and Firestore rules deny client writes to matches, so this is the only way
 * to edit locked data.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { user, error } = await requireTracker(req);
  if (error) return error;

  const { tournamentId, matchId } = await params;
  const adminDb = getAdminDb();
  const body = (await req.json().catch(() => ({}))) as any;

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const matchRef = tournamentRef.collection("matches").doc(matchId);

  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (body?.action === "relock") {
    await matchRef.update({ editUnlock: null });
    return NextResponse.json({ ok: true });
  }

  const scope = body?.scope;
  if (scope !== "set" && scope !== "match") {
    return NextResponse.json({ error: "scope must be 'set' or 'match'" }, { status: 400 });
  }
  const setNumber =
    scope === "set" ? (Number.isInteger(body?.setNumber) ? Number(body.setNumber) : null) : null;
  if (scope === "set" && (!setNumber || setNumber < 1)) {
    return NextResponse.json({ error: "setNumber required for set unlock" }, { status: 400 });
  }
  if (!isValidPasscodeFormat(body?.passcode)) {
    return NextResponse.json({ error: "Passcode must be 4 digits" }, { status: 400 });
  }

  const tournamentSnap = await tournamentRef.get();
  const sport = sportFromStatTrackerId(
    String((tournamentSnap.data() as any)?.statTrackerId ?? "volleyball.v1")
  );

  const check = await checkPasscode(sport, body.passcode);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const expiresAt = Date.now() + UNLOCK_WINDOW_MS;
  await matchRef.update({
    editUnlock: { scope, setNumber, expiresAt, unlockedBy: user.uid },
  });

  return NextResponse.json({ ok: true, editUnlock: { scope, setNumber, expiresAt } });
}
