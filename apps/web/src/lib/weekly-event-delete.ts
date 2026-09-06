import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAdminAudit } from "@/lib/admin-audit";
import { WEEKLY_TEAMS_COLLECTION } from "@/lib/weekly-event-teams";
import { weeklyOccurrenceFinished, weeklyRsvpWindow } from "@/lib/weekly-rsvp";

export type WeeklyDeleteErrorCode =
  | "NOT_FOUND"
  | "NOT_WEEKLY"
  | "OCCURRENCE_FINISHED"
  | "RSVP_WINDOW_OPEN"
  | "HAS_RSVPS"
  | "HAS_TOKEN_HISTORY";

export class WeeklyDeleteError extends Error {
  code: WeeklyDeleteErrorCode;

  constructor(code: WeeklyDeleteErrorCode, message: string) {
    super(message);
    this.name = "WeeklyDeleteError";
    this.code = code;
  }
}

export function isWeeklyDeleteError(err: unknown): err is WeeklyDeleteError {
  return err instanceof WeeklyDeleteError;
}

/** Codes that mean “skip this week” during series delete (not a hard failure). */
export function isPristineSkipCode(code: WeeklyDeleteErrorCode): boolean {
  return (
    code === "OCCURRENCE_FINISHED" ||
    code === "RSVP_WINDOW_OPEN" ||
    code === "HAS_RSVPS" ||
    code === "HAS_TOKEN_HISTORY"
  );
}

async function deleteWeeklyTeams(adminDb: Firestore, eventId: string): Promise<number> {
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection(WEEKLY_TEAMS_COLLECTION)
    .get();
  if (snap.empty) return 0;
  let batch = adminDb.batch();
  let ops = 0;
  let deleted = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    ops += 1;
    deleted += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return deleted;
}

export async function assertWeeklyEventDeletable(eventId: string): Promise<{
  title: string;
  seriesId: string | null;
}> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("events").doc(eventId).get();
  if (!snap.exists) {
    throw new WeeklyDeleteError("NOT_FOUND", "Event not found");
  }
  const data = snap.data() ?? {};
  if (data.category !== "WEEKLY_SPORTS") {
    throw new WeeklyDeleteError("NOT_WEEKLY", "Only weekly sports occurrences use this delete path");
  }

  const eventShape = {
    category: "WEEKLY_SPORTS" as const,
    status: typeof data.status === "string" ? data.status : null,
    rsvpOpensAt: data.rsvpOpensAt,
    rsvpClosesAt: data.rsvpClosesAt,
    rsvpManualOverride:
      data.rsvpManualOverride === "open" || data.rsvpManualOverride === "closed"
        ? data.rsvpManualOverride
        : null,
  };

  if (weeklyOccurrenceFinished(eventShape)) {
    throw new WeeklyDeleteError(
      "OCCURRENCE_FINISHED",
      "Completed or cancelled weeks cannot be deleted. Keep them for history."
    );
  }

  const window = weeklyRsvpWindow(eventShape);
  if (window !== "before") {
    throw new WeeklyDeleteError(
      "RSVP_WINDOW_OPEN",
      window === "open"
        ? "RSVP is open for this week. Use Manage → Cancel event instead of delete."
        : "RSVP has closed for this week. Use Manage → Cancel event instead of delete."
    );
  }

  const [rsvpSnap, txSnap] = await Promise.all([
    adminDb.collection("event_rsvps").where("eventId", "==", eventId).limit(1).get(),
    adminDb.collection("token_transactions").where("eventId", "==", eventId).limit(1).get(),
  ]);

  if (!rsvpSnap.empty) {
    throw new WeeklyDeleteError(
      "HAS_RSVPS",
      "This week has RSVPs. Use Manage → Cancel event to refund tokens, then keep the cancelled week."
    );
  }
  if (!txSnap.empty) {
    throw new WeeklyDeleteError(
      "HAS_TOKEN_HISTORY",
      "This week has token ledger history and cannot be hard-deleted."
    );
  }

  return {
    title: typeof data.title === "string" ? data.title : "Weekly event",
    seriesId: typeof data.seriesId === "string" ? data.seriesId : null,
  };
}

export async function deleteWeeklyOccurrence(
  eventId: string,
  opts: { adminUid: string }
): Promise<{ teamsDeleted: number }> {
  const meta = await assertWeeklyEventDeletable(eventId);
  const adminDb = getAdminDb();
  const teamsDeleted = await deleteWeeklyTeams(adminDb, eventId);
  await adminDb.collection("events").doc(eventId).delete();
  await writeAdminAudit({
    adminUid: opts.adminUid,
    targetUid: opts.adminUid,
    action: "weekly.delete_occurrence",
    meta: {
      eventId,
      title: meta.title,
      seriesId: meta.seriesId,
      teamsDeleted,
    },
  });
  return { teamsDeleted };
}

/** Clear dead series linkage on weeks that remain after a series template is removed. */
export async function clearSeriesIdOnOccurrences(
  seriesId: string,
  excludeEventIds: Set<string> = new Set()
): Promise<number> {
  const adminDb = getAdminDb();
  const occ = await adminDb.collection("events").where("seriesId", "==", seriesId).get();
  if (occ.empty) return 0;
  let batch = adminDb.batch();
  let ops = 0;
  let updated = 0;
  for (const doc of occ.docs) {
    if (excludeEventIds.has(doc.id)) continue;
    batch.update(doc.ref, {
      seriesId: null,
      seriesPaused: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops += 1;
    updated += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return updated;
}
