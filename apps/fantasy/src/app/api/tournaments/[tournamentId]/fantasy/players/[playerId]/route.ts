import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireFantasyUser } from "@/lib/server-auth";
import {
  ageFromDob,
  parseCachedSkills,
  publicProfileFromRegistration,
} from "@/lib/registration-profile";

export const dynamic = "force-dynamic";

/**
 * One-player registration profile for the roster detail sheet.
 * Avoids bulk enriching every player on the edit page.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tournamentId: string; playerId: string }> }
) {
  const auth = await requireFantasyUser(req);
  if (auth.error) return auth.error;

  const { tournamentId, playerId } = await params;
  const adminDb = getAdminDb();
  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const playerRef = tournamentRef.collection("players").doc(playerId);
  const [tournamentSnap, playerSnap] = await Promise.all([
    tournamentRef.get(),
    playerRef.get(),
  ]);

  if (!tournamentSnap.exists || !playerSnap.exists) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const tournament = tournamentSnap.data() as Record<string, unknown>;
  const data = playerSnap.data() as Record<string, unknown>;

  let photoUrl =
    typeof data.photoUrl === "string" && data.photoUrl.trim() ? data.photoUrl.trim() : null;
  let height =
    typeof data.height === "string" && data.height.trim() ? data.height.trim() : null;
  let dateOfBirth =
    typeof data.dateOfBirth === "string" && data.dateOfBirth.trim()
      ? data.dateOfBirth.trim()
      : null;
  let skills = parseCachedSkills(data.skills);

  const eventId =
    typeof tournament.eventId === "string" && tournament.eventId.trim()
      ? tournament.eventId.trim()
      : null;

  if (eventId && (!photoUrl || !height || !dateOfBirth || skills.length === 0)) {
    const privateSnap = await tournamentRef.collection("playersPrivate").doc(playerId).get();
    const registrationId =
      (privateSnap.data() as { source?: { registrationId?: string } } | undefined)?.source
        ?.registrationId ?? playerId;
    const regSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("event_registrations")
      .doc(String(registrationId))
      .get();

    if (regSnap.exists) {
      const profile = publicProfileFromRegistration(regSnap.data() as Record<string, unknown>);
      photoUrl = photoUrl || profile.photoUrl;
      height = height || profile.height;
      dateOfBirth = dateOfBirth || profile.dateOfBirth;
      if (!skills.length) skills = profile.skills;

      // Best-effort single-doc cache warm (does not block response correctness).
      void playerRef
        .set(
          {
            ...(photoUrl ? { photoUrl } : {}),
            ...(height ? { height } : {}),
            ...(dateOfBirth ? { dateOfBirth } : {}),
            ...(skills.length ? { skills } : {}),
          },
          { merge: true }
        )
        .catch(() => {});
    }
  }

  return NextResponse.json({
    player: {
      id: playerId,
      displayName: String(data.displayName ?? "Player"),
      number:
        typeof data.number === "number"
          ? data.number
          : data.number != null && !Number.isNaN(Number(data.number))
            ? Number(data.number)
            : null,
      photoUrl,
      age: ageFromDob(dateOfBirth),
      height,
      skills,
    },
  });
}
