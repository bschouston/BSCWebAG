import { NextRequest, NextResponse } from "next/server";
import {
  FieldValue,
  type CollectionReference,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { isTournamentPlayoffsActive } from "@/lib/tournament-delete-context";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 400;

/** Subcollections created by convert / early setup that are safe to wipe on unpromote. */
const CASCADE_COLLECTIONS = [
  "players",
  "playersPrivate",
  "playerStats",
  "teamStats",
  "divisions",
  "locks",
  "matches",
  "teams",
] as const;

async function deleteQueryInBatches(
  adminDb: Firestore,
  collectionRef: CollectionReference
): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await collectionRef.limit(BATCH_LIMIT).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH_LIMIT) break;
  }
  return deleted;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const { tournamentId } = await params;
    const body = (await req.json().catch(() => ({}))) as { confirmEventId?: string };
    const confirmEventId = String(body.confirmEventId ?? "").trim();
    if (!confirmEventId) {
      return NextResponse.json({ error: "confirmEventId is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const tournament = tournamentSnap.data() as { eventId?: string; name?: string };
    const linkedEventId = String(tournament.eventId ?? "").trim();
    if (!linkedEventId) {
      return NextResponse.json(
        { error: "Tournament is not linked to a featured event" },
        { status: 400 }
      );
    }
    if (linkedEventId !== confirmEventId) {
      return NextResponse.json(
        { error: "confirmEventId does not match this tournament’s linked event" },
        { status: 400 }
      );
    }

    const eventRef = adminDb.collection("events").doc(linkedEventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Linked event not found" }, { status: 404 });
    }

    const event = eventSnap.data() as { tournamentId?: string; name?: string };
    const eventTournamentId = String(event.tournamentId ?? "").trim();
    if (eventTournamentId && eventTournamentId !== tournamentId) {
      return NextResponse.json(
        {
          error: "Event is linked to a different tournament",
          eventTournamentId,
        },
        { status: 409 }
      );
    }

    const [matchesSnap, teamsSnap, playoffsActive] = await Promise.all([
      tournamentRef.collection("matches").limit(1).get(),
      tournamentRef.collection("teams").limit(1).get(),
      isTournamentPlayoffsActive(adminDb, tournamentId),
    ]);

    const blockers: string[] = [];
    if (!matchesSnap.empty) {
      blockers.push("Tournament has matches — remove the schedule first");
    }
    if (!teamsSnap.empty) {
      blockers.push("Tournament has teams — remove teams first");
    }
    if (playoffsActive) {
      blockers.push("Playoffs are active — clear playoffs first");
    }
    if (blockers.length) {
      return NextResponse.json(
        {
          error: "Cannot undo convert while competition data exists",
          blockers,
        },
        { status: 409 }
      );
    }

    // Unlink event first so sync cannot re-attach mid-delete.
    await eventRef.update({
      tournamentId: FieldValue.delete(),
      convertedToTournamentAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const deletedCounts: Record<string, number> = {};
    for (const name of CASCADE_COLLECTIONS) {
      deletedCounts[name] = await deleteQueryInBatches(
        adminDb,
        tournamentRef.collection(name)
      );
    }

    await tournamentRef.delete();

    return NextResponse.json({
      ok: true,
      tournamentId,
      eventId: linkedEventId,
      eventName: event.name ?? null,
      deletedCounts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to undo convert";
    console.error("Unpromote tournament error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
