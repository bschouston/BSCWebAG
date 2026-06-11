import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

/** Admin: full play log for a match, including soft-deleted plays. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; matchId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const adminDb = getAdminDb();
  const { tournamentId, matchId } = await params;

  const snap = await adminDb
    .collection("tournaments")
    .doc(tournamentId)
    .collection("matches")
    .doc(matchId)
    .collection("plays")
    .orderBy("seq", "desc")
    .get();

  return NextResponse.json({
    plays: snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        deletedAt: data.deletedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    }),
  });
}
