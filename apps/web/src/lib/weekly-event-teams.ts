import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { weeklyOccurrenceFinished } from "@/lib/weekly-rsvp";
import { DEFAULT_WEEKLY_TEAMS, normalizeTeamColor } from "@/lib/weekly-team-colors";

export const WEEKLY_TEAMS_COLLECTION = "weekly_teams";

export type WeeklyTeamDoc = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  /** Optional captain; must be a confirmed member on this team. */
  captainUserId: string | null;
};

export type WeeklyTeamMember = {
  rsvpId: string;
  userId: string;
  name: string;
  email: string | null;
  teamId: string | null;
  /** Order within the assigned team (ignored when unassigned). */
  teamSortOrder: number;
};

function memberName(user: Record<string, unknown> | undefined): string {
  if (!user) return "Member";
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

export function assertWeeklyEvent(event: Record<string, unknown>) {
  if (event.category !== "WEEKLY_SPORTS") {
    const err = new Error("NOT_WEEKLY");
    throw err;
  }
}

export function assertNotFinished(event: Record<string, unknown>) {
  if (
    weeklyOccurrenceFinished({
      category: typeof event.category === "string" ? event.category : null,
      status: typeof event.status === "string" ? event.status : null,
    })
  ) {
    throw new Error("OCCURRENCE_DONE");
  }
}

export async function loadWeeklyTeams(adminDb: Firestore, eventId: string): Promise<WeeklyTeamDoc[]> {
  const snap = await adminDb.collection("events").doc(eventId).collection(WEEKLY_TEAMS_COLLECTION).get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name || "Team").trim() || "Team",
        color: normalizeTeamColor(data.color),
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
        captainUserId:
          typeof data.captainUserId === "string" && data.captainUserId.trim()
            ? data.captainUserId.trim()
            : null,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function loadConfirmedTeamMembers(
  adminDb: Firestore,
  eventId: string
): Promise<WeeklyTeamMember[]> {
  const rsvpsSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
  const confirmed = rsvpsSnap.docs.filter((d) => d.data().status === "CONFIRMED");
  const members: WeeklyTeamMember[] = [];
  await Promise.all(
    confirmed.map(async (doc) => {
      const data = doc.data();
      const userId = String(data.userId || "");
      const user = userId ? (await adminDb.collection("users").doc(userId).get()).data() : undefined;
      members.push({
        rsvpId: doc.id,
        userId,
        name: memberName(user as Record<string, unknown> | undefined),
        email: typeof user?.email === "string" ? user.email : null,
        teamId: typeof data.teamId === "string" && data.teamId ? data.teamId : null,
        teamSortOrder: typeof data.teamSortOrder === "number" ? data.teamSortOrder : 1_000_000,
      });
    })
  );
  members.sort(
    (a, b) =>
      a.teamSortOrder - b.teamSortOrder ||
      a.name.localeCompare(b.name) ||
      a.rsvpId.localeCompare(b.rsvpId)
  );
  return members;
}

/** Next teamSortOrder when appending a player to a team (0 if empty). */
export async function nextTeamSortOrder(
  adminDb: Firestore,
  eventId: string,
  teamId: string,
  excludeRsvpId?: string
): Promise<number> {
  const members = await loadConfirmedTeamMembers(adminDb, eventId);
  const onTeam = members.filter(
    (m) => m.teamId === teamId && (!excludeRsvpId || m.rsvpId !== excludeRsvpId)
  );
  if (onTeam.length === 0) return 0;
  return Math.max(...onTeam.map((m) => m.teamSortOrder)) + 1;
}

export async function ensureDefaultWeeklyTeams(adminDb: Firestore, eventId: string): Promise<WeeklyTeamDoc[]> {
  const existing = await loadWeeklyTeams(adminDb, eventId);
  if (existing.length > 0) return existing;
  const col = adminDb.collection("events").doc(eventId).collection(WEEKLY_TEAMS_COLLECTION);
  const created: WeeklyTeamDoc[] = [];
  for (const team of DEFAULT_WEEKLY_TEAMS) {
    const ref = col.doc();
    await ref.set({
      name: team.name,
      color: team.color,
      sortOrder: team.sortOrder,
      captainUserId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.push({
      id: ref.id,
      name: team.name,
      color: team.color,
      sortOrder: team.sortOrder,
      captainUserId: null,
    });
  }
  return created;
}

/** If userId is captain of teamId, clear captainUserId. */
export async function clearCaptainIfMatches(
  adminDb: Firestore,
  eventId: string,
  teamId: string | null | undefined,
  userId: string
) {
  if (!teamId || !userId) return;
  const ref = adminDb
    .collection("events")
    .doc(eventId)
    .collection(WEEKLY_TEAMS_COLLECTION)
    .doc(teamId);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (String(snap.data()?.captainUserId || "") !== userId) return;
  await ref.update({ captainUserId: null, updatedAt: FieldValue.serverTimestamp() });
}

export async function countAssignedTeamMembers(adminDb: Firestore, eventId: string): Promise<number> {
  const members = await loadConfirmedTeamMembers(adminDb, eventId);
  return members.filter((m) => Boolean(m.teamId)).length;
}

export async function resetWeeklyTeams(
  adminDb: Firestore,
  eventId: string
): Promise<{ clearedAssignments: number; deletedTeams: number }> {
  const rsvpsSnap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
  let clearedAssignments = 0;
  const rsvpBatch = adminDb.batch();
  for (const doc of rsvpsSnap.docs) {
    if (doc.data().teamId) {
      rsvpBatch.update(doc.ref, {
        teamId: null,
        teamSortOrder: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      clearedAssignments += 1;
    }
  }
  if (clearedAssignments > 0) await rsvpBatch.commit();

  const teamsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection(WEEKLY_TEAMS_COLLECTION)
    .get();
  if (teamsSnap.size > 0) {
    const teamBatch = adminDb.batch();
    for (const doc of teamsSnap.docs) teamBatch.delete(doc.ref);
    await teamBatch.commit();
  }

  return { clearedAssignments, deletedTeams: teamsSnap.size };
}

export async function clearRsvpTeamId(adminDb: Firestore, eventId: string, teamId: string) {
  const snap = await adminDb.collection("event_rsvps").where("eventId", "==", eventId).get();
  const batch = adminDb.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (doc.data().teamId === teamId) {
      batch.update(doc.ref, {
        teamId: null,
        teamSortOrder: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      n += 1;
    }
  }
  if (n > 0) await batch.commit();
}
