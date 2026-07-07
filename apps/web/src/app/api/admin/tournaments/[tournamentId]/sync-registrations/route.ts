import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { syncAllRegistrationsToTournament } from "@/lib/registration-tournament-sync";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const { tournamentId } = await params;
    const adminDb = getAdminDb();
    const tournamentSnap = await adminDb.collection("tournaments").doc(tournamentId).get();
    if (!tournamentSnap.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const eventId = String((tournamentSnap.data() as { eventId?: string })?.eventId ?? "").trim();
    if (!eventId) {
      return NextResponse.json(
        { error: "Tournament is not linked to an event" },
        { status: 400 }
      );
    }

    const result = await syncAllRegistrationsToTournament(adminDb, eventId);
    return NextResponse.json({ tournamentId, eventId, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to sync registrations";
    console.error("Sync registrations error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
