import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../../lib/firebase/admin";
import { requireTracker } from "../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireTracker(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId } = await params;
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const [matchesSnap, teamsSnap] = await Promise.all([
    tournamentRef.collection("matches").orderBy("scheduledAt", "asc").get(),
    tournamentRef.collection("teams").get(),
  ]);

  const teamNames = new Map<string, string>(
    teamsSnap.docs.map((d) => [d.id, String((d.data() as any)?.name ?? d.id)])
  );

  const matches = matchesSnap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      ...data,
      teamAName: teamNames.get(data.teamAId) ?? data.teamAId,
      teamBName: teamNames.get(data.teamBId) ?? data.teamBId,
    };
  });

  return NextResponse.json({ matches });
}
