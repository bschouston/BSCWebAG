import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  registrationBelongsInTournament,
  registrationIsVisibleOnRoster,
} from "@/lib/registration-status";
import { publicProfileFromRegistration } from "@/lib/registration-public-profile";

export { photoUrlFromRegistration } from "@/lib/registration-public-profile";

function normalizeNameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Last two name tokens — matches "Mulla Hussain Khuzaimah" to "Hussain Khuzaimah". */
function nameMatchKey(name: string): string {
  const parts = normalizeNameKey(name).split(" ").filter(Boolean);
  return parts.slice(-2).join(" ");
}

export function displayNameFromRegistration(reg: Record<string, unknown>): string {
  const title = String(reg.title ?? "").trim();
  const first = String(reg.firstName ?? "").trim();
  const last = String(reg.lastName ?? "").trim();
  const full = [title, first, last].filter(Boolean).join(" ").trim();
  return full || String(reg.teamName ?? reg.email ?? "Player").trim();
}

function playerPublicFieldsFromRegistration(reg: Record<string, unknown>) {
  const profile = publicProfileFromRegistration(reg);
  return {
    ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
    ...(profile.height ? { height: profile.height } : {}),
    ...(profile.dateOfBirth ? { dateOfBirth: profile.dateOfBirth } : {}),
    ...(profile.skills.length ? { skills: profile.skills } : {}),
  };
}

type PlayerLookupCache = {
  playerIds: Set<string>;
  byRegistrationId: Map<string, string>;
  byEmail: Map<string, string>;
  byNameKey: Map<string, string>;
  linkedPlayerIds: Set<string>;
};

async function buildPlayerLookupCache(
  tournamentRef: FirebaseFirestore.DocumentReference
): Promise<PlayerLookupCache> {
  const [playersSnap, privateSnap] = await Promise.all([
    tournamentRef.collection("players").get(),
    tournamentRef.collection("playersPrivate").get(),
  ]);

  const playerIds = new Set<string>(playersSnap.docs.map((d) => d.id));
  const byRegistrationId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const linkedPlayerIds = new Set<string>();

  for (const doc of privateSnap.docs) {
    const data = doc.data();
    const source = data?.source as { registrationId?: string } | undefined;
    if (source?.registrationId) {
      byRegistrationId.set(source.registrationId, doc.id);
      linkedPlayerIds.add(doc.id);
    }
    const email = normalizeNameKey(String(data?.email ?? ""));
    if (email && !byEmail.has(email)) byEmail.set(email, doc.id);
  }

  const byNameKey = new Map<string, string>();
  for (const doc of playersSnap.docs) {
    if (byRegistrationId.has(doc.id)) continue;
    const displayName = String(doc.data()?.displayName ?? "").trim();
    if (!displayName) continue;
    const key = nameMatchKey(displayName);
    if (key && !byNameKey.has(key)) byNameKey.set(key, doc.id);
  }

  return { playerIds, byRegistrationId, byEmail, byNameKey, linkedPlayerIds };
}

/** Cache-only player match (no extra reads) — same order as findTournamentPlayerIdByRegistration. */
function findPlayerIdInCache(
  cache: PlayerLookupCache,
  registrationId: string,
  registration: Record<string, unknown>
): string | null {
  if (cache.playerIds.has(registrationId)) return registrationId;

  const linked = cache.byRegistrationId.get(registrationId);
  if (linked) return linked;

  const email = normalizeNameKey(String(registration.email ?? ""));
  if (email) {
    const byEmail = cache.byEmail.get(email);
    if (byEmail) return byEmail;
  }

  const nameKey = nameMatchKey(displayNameFromRegistration(registration));
  if (nameKey) {
    const byName = cache.byNameKey.get(nameKey);
    if (byName && !cache.linkedPlayerIds.has(byName)) return byName;
  }

  return null;
}

export async function findTournamentPlayerIdByRegistration(
  tournamentRef: FirebaseFirestore.DocumentReference,
  registrationId: string,
  registration?: Record<string, unknown>,
  cache?: PlayerLookupCache
): Promise<string | null> {
  const directSnap = await tournamentRef.collection("players").doc(registrationId).get();
  if (directSnap.exists) return registrationId;

  const lookup = cache ?? (await buildPlayerLookupCache(tournamentRef));

  const linked = lookup.byRegistrationId.get(registrationId);
  if (linked) return linked;

  if (registration) {
    const email = normalizeNameKey(String(registration.email ?? ""));
    if (email) {
      const byEmail = lookup.byEmail.get(email);
      if (byEmail) return byEmail;
    }

    const nameKey = nameMatchKey(displayNameFromRegistration(registration));
    if (nameKey) {
      const byName = lookup.byNameKey.get(nameKey);
      if (byName && !lookup.linkedPlayerIds.has(byName)) return byName;
    }
  }

  return null;
}

/** Resolve tournament for an event — repairs stale event.tournamentId when needed. */
export async function resolveTournamentIdForEvent(
  adminDb: Firestore,
  eventId: string
): Promise<string | null> {
  const eventRef = adminDb.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return null;

  const storedId = String((eventSnap.data() as { tournamentId?: string })?.tournamentId ?? "").trim();
  if (storedId) {
    const storedSnap = await adminDb.collection("tournaments").doc(storedId).get();
    if (storedSnap.exists) return storedId;
  }

  const linked = await adminDb
    .collection("tournaments")
    .where("eventId", "==", eventId)
    .limit(5)
    .get();

  if (linked.empty) return null;

  const tournamentId = linked.docs[0]!.id;
  if (storedId !== tournamentId) {
    await eventRef.update({ tournamentId });
  }
  return tournamentId;
}

/**
 * Bulk "Sync from registrations": add-only. Takes every non-archived registration
 * that is confirmed or waitlisted and creates players for the ones missing from
 * the tournament. Existing players are left untouched, nothing is removed.
 */
export async function syncAllRegistrationsToTournament(
  adminDb: Firestore,
  eventId: string
): Promise<{ synced: number; upserted: number; removed: number; skipped: number }> {
  const tournamentId = await resolveTournamentIdForEvent(adminDb, eventId);
  if (!tournamentId) {
    return { synced: 0, upserted: 0, removed: 0, skipped: 0 };
  }

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);
  const [regsSnap, cache] = await Promise.all([
    adminDb.collection("events").doc(eventId).collection("event_registrations").get(),
    buildPlayerLookupCache(tournamentRef),
  ]);

  let upserted = 0;
  let skipped = 0;
  const now = Timestamp.now();
  let batch = adminDb.batch();
  let batchWrites = 0;
  const commits: Promise<unknown>[] = [];

  for (const doc of regsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;

    // Confirmed + waitlisted, never archived/cancelled/draft.
    if (!registrationIsVisibleOnRoster(data)) {
      skipped += 1;
      continue;
    }

    const publicFields = playerPublicFieldsFromRegistration(data);

    // Already in tournament: refresh display name / public profile, don't re-create.
    const existingId = findPlayerIdInCache(cache, doc.id, data);
    if (existingId) {
      batch.set(
        tournamentRef.collection("players").doc(existingId),
        {
          displayName: displayNameFromRegistration(data),
          ...publicFields,
          updatedAt: now,
        },
        { merge: true }
      );
      batchWrites += 1;
      skipped += 1;
      if (batchWrites >= 400) {
        commits.push(batch.commit());
        batch = adminDb.batch();
        batchWrites = 0;
      }
      continue;
    }

    const playerId = doc.id;
    batch.set(
      tournamentRef.collection("players").doc(playerId),
      {
        displayName: displayNameFromRegistration(data),
        number: (data.jerseyNumber ?? data.number ?? null) as number | null,
        teamId: null,
        ...publicFields,
        createdAt: now,
      },
      { merge: true }
    );
    batch.set(
      tournamentRef.collection("playersPrivate").doc(playerId),
      {
        email: data.email ?? null,
        source: { type: "event_registration", eventId, registrationId: playerId },
        createdAt: now,
      },
      { merge: true }
    );

    // Keep the cache current so duplicate registrations in the same run match.
    cache.playerIds.add(playerId);
    cache.byRegistrationId.set(playerId, playerId);
    cache.linkedPlayerIds.add(playerId);
    const email = normalizeNameKey(String(data.email ?? ""));
    if (email && !cache.byEmail.has(email)) cache.byEmail.set(email, playerId);

    upserted += 1;
    batchWrites += 2;
    if (batchWrites >= 400) {
      commits.push(batch.commit());
      batch = adminDb.batch();
      batchWrites = 0;
    }
  }

  if (batchWrites > 0) commits.push(batch.commit());
  await Promise.all(commits);

  return { synced: regsSnap.size, upserted, removed: 0, skipped };
}

/**
 * Keep tournaments/{id}/players in sync when a registration is confirmed, waitlisted,
 * or cancelled. Tracker reads players with a team assignment in real time.
 */
export async function syncRegistrationToTournament(
  adminDb: Firestore,
  eventId: string,
  registrationId: string,
  registration: Record<string, unknown>
): Promise<{ action: "upserted" | "removed" | "skipped"; playerId?: string }> {
  const tournamentId = await resolveTournamentIdForEvent(adminDb, eventId);
  if (!tournamentId) return { action: "skipped" };

  const tournamentRef = adminDb.collection("tournaments").doc(tournamentId);

  const existingPlayerId = await findTournamentPlayerIdByRegistration(
    tournamentRef,
    registrationId,
    registration
  );
  const shouldInclude = registrationBelongsInTournament(
    registration as {
      status?: string;
      paymentStatus?: string;
      isDraft?: boolean;
      archivedAt?: unknown;
    }
  );

  if (!shouldInclude) {
    if (!existingPlayerId) return { action: "skipped" };

    const playerRef = tournamentRef.collection("players").doc(existingPlayerId);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists) return { action: "skipped" };

    const teamId = playerSnap.data()?.teamId;
    if (teamId) {
      await playerRef.update({
        displayName: displayNameFromRegistration(registration),
        ...playerPublicFieldsFromRegistration(registration),
      });
      return { action: "upserted", playerId: existingPlayerId };
    }

    const batch = adminDb.batch();
    batch.delete(playerRef);
    batch.delete(tournamentRef.collection("playersPrivate").doc(existingPlayerId));
    await batch.commit();
    return { action: "removed", playerId: existingPlayerId };
  }

  const playerId = existingPlayerId ?? registrationId;
  const now = Timestamp.now();
  const displayName = displayNameFromRegistration(registration);
  const existingSnap = existingPlayerId
    ? await tournamentRef.collection("players").doc(playerId).get()
    : null;

  await tournamentRef
    .collection("players")
    .doc(playerId)
    .set(
      {
        displayName,
        number: (registration.jerseyNumber ?? registration.number ?? null) as number | null,
        teamId: existingSnap?.data()?.teamId ?? null,
        ...playerPublicFieldsFromRegistration(registration),
        ...(existingSnap?.exists ? { updatedAt: now } : { createdAt: now }),
      },
      { merge: true }
    );

  await tournamentRef
    .collection("playersPrivate")
    .doc(playerId)
    .set(
      {
        email: registration.email ?? null,
        source: { type: "event_registration", eventId, registrationId },
        ...(existingSnap?.exists ? { updatedAt: now } : { createdAt: now }),
      },
      { merge: true }
    );

  return { action: "upserted", playerId };
}
