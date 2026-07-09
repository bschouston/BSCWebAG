import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  normalizeTrackerEmail,
  trackerEmailDocId,
  TRACKER_AUDIT_ACTION_LABELS,
  type TrackerAuditAction,
} from "@bsc/shared";

const ACCESS_CONFIG_PATH = "trackerAccess/config";

export async function getTrackerAccessConfig(adminDb: Firestore) {
  const snap = await adminDb.doc(ACCESS_CONFIG_PATH).get();
  const data = snap.data() as { publicGoogleLogin?: boolean } | undefined;
  return { publicGoogleLogin: data?.publicGoogleLogin === true };
}

export async function setTrackerAccessConfig(
  adminDb: Firestore,
  publicGoogleLogin: boolean,
  updatedBy: string
) {
  await adminDb.doc(ACCESS_CONFIG_PATH).set(
    {
      publicGoogleLogin,
      updatedAt: Timestamp.now(),
      updatedBy,
    },
    { merge: true }
  );
}

export async function listAuthorizedTrackerEmails(adminDb: Firestore) {
  const snap = await adminDb.collection("trackerAuthorizedEmails").orderBy("email").get();
  return snap.docs.map((d) => {
    const data = d.data() as { email?: string; label?: string; addedAt?: Timestamp };
    return {
      id: d.id,
      email: data.email ?? d.id,
      label: data.label ?? "",
      addedAt: data.addedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  });
}

export async function addAuthorizedTrackerEmail(
  adminDb: Firestore,
  email: string,
  addedBy: string,
  label?: string
) {
  const normalized = normalizeTrackerEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Valid email is required");
  }
  await adminDb
    .collection("trackerAuthorizedEmails")
    .doc(trackerEmailDocId(normalized))
    .set({
      email: normalized,
      label: label?.trim() || null,
      addedAt: Timestamp.now(),
      addedBy,
    });
}

export async function removeAuthorizedTrackerEmail(adminDb: Firestore, email: string) {
  const normalized = normalizeTrackerEmail(email);
  await adminDb.collection("trackerAuthorizedEmails").doc(trackerEmailDocId(normalized)).delete();
}

export type TrackerAuditRow = {
  id: string;
  createdAt: string | null;
  userId: string;
  userEmail: string | null;
  userDisplayName: string;
  action: TrackerAuditAction;
  actionLabel: string;
  tournamentId: string | null;
  tournamentName: string | null;
  matchId: string | null;
  teamKey: string | null;
  teamName: string | null;
  setNumber: number | null;
  statKey: string | null;
  statLabel: string | null;
  playerName: string | null;
  details: Record<string, unknown> | null;
};

export async function listTrackerAuditLogs(
  adminDb: Firestore,
  options: {
    email?: string;
    tournamentId?: string;
    matchId?: string;
    action?: string;
    sort?: "email" | "time";
    limit?: number;
  }
): Promise<TrackerAuditRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000);
  const snap = await adminDb
    .collection("trackerAuditLogs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  let rows: TrackerAuditRow[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const action = String(data.action ?? "") as TrackerAuditAction;
    return {
      id: d.id,
      createdAt: (data.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString?.() ?? null,
      userId: String(data.userId ?? ""),
      userEmail: data.userEmail ? String(data.userEmail) : null,
      userDisplayName: String(data.userDisplayName ?? ""),
      action,
      actionLabel: TRACKER_AUDIT_ACTION_LABELS[action] ?? action,
      tournamentId: data.tournamentId ? String(data.tournamentId) : null,
      tournamentName: data.tournamentName ? String(data.tournamentName) : null,
      matchId: data.matchId ? String(data.matchId) : null,
      teamKey: data.teamKey ? String(data.teamKey) : null,
      teamName: data.teamName ? String(data.teamName) : null,
      setNumber: typeof data.setNumber === "number" ? data.setNumber : null,
      statKey: data.statKey ? String(data.statKey) : null,
      statLabel: data.statLabel ? String(data.statLabel) : null,
      playerName: data.playerName ? String(data.playerName) : null,
      details: (data.details as Record<string, unknown> | null) ?? null,
    };
  });

  const emailFilter = options.email?.trim().toLowerCase();
  if (emailFilter) {
    rows = rows.filter((r) => (r.userEmail ?? "").includes(emailFilter));
  }
  if (options.tournamentId?.trim()) {
    rows = rows.filter((r) => r.tournamentId === options.tournamentId);
  }
  if (options.matchId?.trim()) {
    rows = rows.filter((r) => r.matchId === options.matchId);
  }
  if (options.action?.trim()) {
    rows = rows.filter((r) => r.action === options.action);
  }

  if (options.sort === "email") {
    rows.sort(
      (a, b) =>
        (a.userEmail ?? "").localeCompare(b.userEmail ?? "") ||
        String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
    );
  }

  return rows;
}
