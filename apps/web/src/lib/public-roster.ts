import { getAdminDb } from "@/lib/firebase/admin";
import {
  ageFromDob,
  hasCachedPublicProfile,
  parseCachedSkills,
  publicProfileFromRegistration,
  type PublicRosterSkill,
} from "@/lib/registration-public-profile";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";

export type { PublicRosterSkill };

export type PublicRosterPlayer = {
  id: string;
  displayName: string;
  number: number | null;
  photoUrl: string | null;
  teamId: string | null;
  age: number | null;
  height: string | null;
  skills: PublicRosterSkill[];
};

function parseJerseyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value != null && String(value).trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function sortRosterPlayers(a: PublicRosterPlayer, b: PublicRosterPlayer): number {
  const an = a.number ?? Number.POSITIVE_INFINITY;
  const bn = b.number ?? Number.POSITIVE_INFINITY;
  return an - bn || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

export function toPublicRosterResponsePlayer(player: PublicRosterPlayer) {
  return {
    id: player.id,
    displayName: player.displayName,
    number: player.number,
    photoUrl: player.photoUrl,
    age: player.age,
    height: player.height,
    skills: player.skills,
  };
}

/** Ensure tournament is publicly live; returns null when not. */
export async function getPublicLiveTournament(
  adminDb: Firestore,
  tournamentId: string
): Promise<{ ref: DocumentReference; data: Record<string, unknown> } | null> {
  const ref = adminDb.collection("tournaments").doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const liveEnabled = data.publicLiveEnabled !== false;
  if (String(data.status ?? "") !== "ACTIVE" || !liveEnabled) return null;
  return { ref, data };
}

async function getAllChunked(
  adminDb: Firestore,
  refs: DocumentReference[]
): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  const chunkSize = 100;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const snaps = await adminDb.getAll(...chunk);
    out.push(...snaps);
  }
  return out;
}

/**
 * Build public roster players.
 * Prefer profile fields cached on player docs; when missing, enrich from a single
 * bulk registration read (not one read per player) and cache results.
 */
export async function buildPublicRosterPlayers(options: {
  adminDb: Firestore;
  tournamentRef: DocumentReference;
  tournament: Record<string, unknown>;
  /** When set, only players on this team. When omitted, all assigned players. */
  teamId?: string;
}): Promise<PublicRosterPlayer[]> {
  const { adminDb, tournamentRef, tournament, teamId } = options;
  const playersQuery = teamId
    ? tournamentRef.collection("players").where("teamId", "==", teamId)
    : tournamentRef.collection("players");
  const playersSnap = await playersQuery.get();

  const eventId =
    typeof tournament.eventId === "string" && tournament.eventId.trim()
      ? tournament.eventId.trim()
      : null;

  const eligibleDocs = playersSnap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const assignedTeamId =
      typeof data.teamId === "string" && data.teamId.trim() ? data.teamId.trim() : null;
    return teamId ? true : !!assignedTeamId;
  });

  const needsEnrichment =
    !!eventId && eligibleDocs.some((doc) => !hasCachedPublicProfile(doc.data() as Record<string, unknown>));

  const regsById = new Map<string, Record<string, unknown>>();
  const privateByPlayerId = new Map<string, { registrationId?: string }>();

  if (needsEnrichment && eventId) {
    const [regsSnap, privateSnaps] = await Promise.all([
      adminDb.collection("events").doc(eventId).collection("event_registrations").get(),
      getAllChunked(
        adminDb,
        eligibleDocs.map((d) => tournamentRef.collection("playersPrivate").doc(d.id))
      ),
    ]);
    for (const d of regsSnap.docs) {
      regsById.set(d.id, d.data() as Record<string, unknown>);
    }
    for (const snap of privateSnaps) {
      if (!snap.exists) continue;
      const source = (snap.data() as { source?: { registrationId?: string } } | undefined)?.source;
      privateByPlayerId.set(snap.id, { registrationId: source?.registrationId });
    }
  }

  const players: PublicRosterPlayer[] = [];
  const cacheWrites: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

  for (const doc of eligibleDocs) {
    const data = doc.data() as Record<string, unknown>;
    const assignedTeamId =
      typeof data.teamId === "string" && data.teamId.trim() ? data.teamId.trim() : null;

    let photoUrl =
      typeof data.photoUrl === "string" && data.photoUrl.trim() ? data.photoUrl.trim() : null;
    let height =
      typeof data.height === "string" && data.height.trim() ? data.height.trim() : null;
    let dateOfBirth =
      typeof data.dateOfBirth === "string" && data.dateOfBirth.trim()
        ? data.dateOfBirth.trim()
        : null;
    let skills = parseCachedSkills(data.skills);

    const cached = hasCachedPublicProfile(data);
    if ((!cached || !photoUrl || !height || !dateOfBirth || skills.length === 0) && eventId) {
      const registrationId =
        privateByPlayerId.get(doc.id)?.registrationId ?? doc.id;
      const reg = regsById.get(String(registrationId));
      if (reg) {
        const profile = publicProfileFromRegistration(reg);
        photoUrl = photoUrl || profile.photoUrl;
        height = height || profile.height;
        dateOfBirth = dateOfBirth || profile.dateOfBirth;
        if (!skills.length) skills = profile.skills;

        // Cache public profile on the player doc for fast subsequent loads.
        cacheWrites.push({
          ref: doc.ref,
          data: {
            ...(photoUrl ? { photoUrl } : {}),
            ...(height ? { height } : {}),
            ...(dateOfBirth ? { dateOfBirth } : {}),
            ...(skills.length ? { skills } : {}),
          },
        });
      }
    }

    players.push({
      id: doc.id,
      displayName: String(data.displayName ?? "Player").trim() || "Player",
      number: parseJerseyNumber(data.number),
      photoUrl,
      teamId: assignedTeamId,
      age: ageFromDob(dateOfBirth),
      height,
      skills,
    });
  }

  players.sort(sortRosterPlayers);

  // Cache in the background — don't block the HTTP response on writes.
  if (cacheWrites.length) {
    void (async () => {
      let batch = adminDb.batch();
      let ops = 0;
      const commits: Promise<unknown>[] = [];
      for (const write of cacheWrites) {
        batch.set(write.ref, write.data, { merge: true });
        ops += 1;
        if (ops >= 400) {
          commits.push(batch.commit());
          batch = adminDb.batch();
          ops = 0;
        }
      }
      if (ops > 0) commits.push(batch.commit());
      await Promise.all(commits);
    })().catch(() => {
      // Best-effort cache warm.
    });
  }

  return players;
}

export { getAdminDb };
