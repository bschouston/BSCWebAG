import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .orderBy("scheduledAt", "asc")
    .get();

  return NextResponse.json({
    matches: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const body = (await req.json()) as any;

  const teamAId = String(body?.teamAId ?? "").trim();
  const teamBId = String(body?.teamBId ?? "").trim();
  if (!teamAId || !teamBId) {
    return NextResponse.json({ error: "teamAId and teamBId required" }, { status: 400 });
  }

  const scheduledAt = body?.scheduledAt ? Timestamp.fromDate(new Date(body.scheduledAt)) : null;

  const courtRaw = body?.courtNumber;
  const courtNumber =
    typeof courtRaw === "number"
      ? courtRaw
      : typeof courtRaw === "string" && courtRaw.trim()
        ? Number(courtRaw)
        : null;
  const courtOk =
    courtNumber != null && Number.isFinite(courtNumber) && courtNumber >= 1
      ? Math.floor(courtNumber)
      : null;

  const ref = adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc();

  await ref.set({
    teamAId,
    teamBId,
    scheduledAt,
    status: body?.status ?? "UPCOMING",
    scoreA: 0,
    scoreB: 0,
    currentSet: 1,
    setScores: [{ a: 0, b: 0 }],
    playSeq: 0,
    startedAt: null,
    completedAt: null,
    winnerTeamId: null,
    lastPlayAt: null,
    ...(courtOk != null ? { courtNumber: courtOk } : {}),
    createdAt: Timestamp.now(),
  });

  return NextResponse.json({ id: ref.id });
}

