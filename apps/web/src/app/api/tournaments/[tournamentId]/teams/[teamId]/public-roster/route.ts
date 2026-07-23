import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { photoUrlFromRegistration } from "@/lib/registration-tournament-sync";

export const dynamic = "force-dynamic";

type PublicRosterPlayer = {
  id: string;
  displayName: string;
  number: number | null;
  photoUrl: string | null;
};

/**
 * Public roster for a tournament team (Live page champion hero, etc.).
 * Resolves headshots from the player doc or linked event registration.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; teamId: string }> }
) {
  const adminDb = getAdminDb();
  const { tournamentId, teamId } = await params;

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const tournament = tournamentSnap.data() as Record<string, unknown>;
  const liveEnabled = tournament.publicLiveEnabled !== false;
  if (String(tournament.status ?? "") !== "ACTIVE" || !liveEnabled) {
    return NextResponse.json({ error: "Tournament is not publicly live" }, { status: 404 });
  }

  const playersSnap = await tournamentRef
    .collection("players")
    .where("teamId", "==", teamId)
    .get();

  const eventId =
    typeof tournament.eventId === "string" && tournament.eventId.trim()
      ? tournament.eventId.trim()
      : null;

  const privateSnaps = await Promise.all(
    playersSnap.docs.map((d) => tournamentRef.collection("playersPrivate").doc(d.id).get())
  );

  const players: PublicRosterPlayer[] = [];
  const photoWrites: Promise<unknown>[] = [];

  for (let i = 0; i < playersSnap.docs.length; i++) {
    const doc = playersSnap.docs[i];
    const data = doc.data() as Record<string, unknown>;
    let photoUrl =
      typeof data.photoUrl === "string" && data.photoUrl.trim() ? data.photoUrl.trim() : null;

    if (!photoUrl && eventId) {
      const privateData = privateSnaps[i]?.data() as
        | { source?: { registrationId?: string } }
        | undefined;
      const registrationId = privateData?.source?.registrationId ?? doc.id;

      try {
        const regSnap = await adminDb
          .collection("events")
          .doc(eventId)
          .collection("event_registrations")
          .doc(String(registrationId))
          .get();
        if (regSnap.exists) {
          photoUrl = photoUrlFromRegistration(regSnap.data() as Record<string, unknown>);
          if (photoUrl) {
            photoWrites.push(doc.ref.set({ photoUrl }, { merge: true }));
          }
        }
      } catch {
        // Ignore registration lookup failures; still return the player.
      }
    }

    const numberRaw = data.number;
    const number =
      typeof numberRaw === "number"
        ? numberRaw
        : numberRaw != null && String(numberRaw).trim() !== "" && !Number.isNaN(Number(numberRaw))
          ? Number(numberRaw)
          : null;

    players.push({
      id: doc.id,
      displayName: String(data.displayName ?? "Player").trim() || "Player",
      number,
      photoUrl,
    });
  }

  players.sort((a, b) => {
    const an = a.number ?? Number.POSITIVE_INFINITY;
    const bn = b.number ?? Number.POSITIVE_INFINITY;
    return an - bn || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });

  if (photoWrites.length) {
    await Promise.all(photoWrites);
  }

  return NextResponse.json({ players });
}
