import { Timestamp, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
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

export type TrackerAuditSortField =
  | "createdAt"
  | "userEmail"
  | "action"
  | "tournamentName"
  | "teamName"
  | "statLabel";

export type ListTrackerAuditOptions = {
  email?: string;
  tournamentId?: string;
  matchId?: string;
  action?: string;
  sortField?: TrackerAuditSortField;
  sortDir?: "asc" | "desc";
  pageSize?: number;
  cursor?: string | null;
};

export type ListTrackerAuditResult = {
  logs: TrackerAuditRow[];
  nextCursor: string | null;
  pageSize: number;
};

const PAGE_SIZES = new Set([25, 50, 100]);

const SORT_FIELDS = new Set<TrackerAuditSortField>([
  "createdAt",
  "userEmail",
  "action",
  "tournamentName",
  "teamName",
  "statLabel",
]);

function mapAuditDoc(d: QueryDocumentSnapshot): TrackerAuditRow {
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
}

function rowMatchesFilters(
  row: TrackerAuditRow,
  filters: {
    emailExact: string;
    tournamentId: string;
    matchIdSubstring: string;
    action: string;
  }
): boolean {
  if (filters.emailExact && (row.userEmail ?? "") !== filters.emailExact) return false;
  if (filters.tournamentId && row.tournamentId !== filters.tournamentId) return false;
  if (
    filters.matchIdSubstring &&
    !(row.matchId ?? "").toLowerCase().includes(filters.matchIdSubstring.toLowerCase())
  ) {
    return false;
  }
  if (filters.action && row.action !== filters.action) return false;
  return true;
}

/**
 * Paginated tracker audit log listing.
 * Equality filters (tournament, action, email) go to Firestore when possible.
 * Match ID is always a case-insensitive substring (post-filtered with over-fetch).
 */
export async function listTrackerAuditLogs(
  adminDb: Firestore,
  options: ListTrackerAuditOptions
): Promise<ListTrackerAuditResult> {
  const pageSize = PAGE_SIZES.has(options.pageSize ?? 0) ? (options.pageSize as number) : 50;
  const sortField: TrackerAuditSortField = SORT_FIELDS.has(
    options.sortField as TrackerAuditSortField
  )
    ? (options.sortField as TrackerAuditSortField)
    : "createdAt";
  const sortDir: "asc" | "desc" =
    options.sortDir === "asc" || options.sortDir === "desc"
      ? options.sortDir
      : sortField === "createdAt"
        ? "desc"
        : "asc";

  const tournamentId = options.tournamentId?.trim() ?? "";
  const matchIdSubstring = options.matchId?.trim() ?? "";
  const action = options.action?.trim() ?? "";
  const emailExact = normalizeTrackerEmail(options.email ?? "");

  const filters = { emailExact, tournamentId, matchIdSubstring, action };

  let query: Query = adminDb.collection("trackerAuditLogs");

  if (tournamentId) query = query.where("tournamentId", "==", tournamentId);
  if (action) query = query.where("action", "==", action);
  if (emailExact) query = query.where("userEmail", "==", emailExact);

  if (sortField === "createdAt") {
    query = query.orderBy("createdAt", sortDir);
  } else {
    query = query.orderBy(sortField, sortDir).orderBy("createdAt", "desc");
  }

  const cursorId = options.cursor?.trim() || "";
  if (cursorId) {
    const cursorSnap = await adminDb.collection("trackerAuditLogs").doc(cursorId).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const needsOverFetch = Boolean(matchIdSubstring);
  const fetchLimit = needsOverFetch ? Math.min(pageSize * 5, 250) : pageSize;

  const collected: TrackerAuditRow[] = [];
  let lastQueryDoc: QueryDocumentSnapshot | null = null;
  let exhausted = false;
  let guard = 0;

  while (collected.length < pageSize && !exhausted && guard < 8) {
    guard += 1;
    const snap = await query.limit(fetchLimit).get();
    if (snap.empty) {
      exhausted = true;
      break;
    }

    for (const doc of snap.docs) {
      lastQueryDoc = doc;
      const row = mapAuditDoc(doc);
      if (!rowMatchesFilters(row, filters)) continue;
      collected.push(row);
      if (collected.length >= pageSize) break;
    }

    if (snap.size < fetchLimit) {
      exhausted = true;
      break;
    }

    if (collected.length < pageSize && lastQueryDoc) {
      query = query.startAfter(lastQueryDoc);
    } else {
      break;
    }
  }

  const nextCursor =
    !exhausted && lastQueryDoc && collected.length >= pageSize ? lastQueryDoc.id : null;

  return { logs: collected.slice(0, pageSize), nextCursor, pageSize };
}
