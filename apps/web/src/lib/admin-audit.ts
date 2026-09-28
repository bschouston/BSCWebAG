import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { memberFullName } from "@/lib/member-name";
import { chicagoDayBounds, parseYmdParam } from "@/lib/ymd-range";

export const ADMIN_AUDIT_ACTION_LABELS: Record<string, string> = {
  "identity.update": "Override name/photo",
  "identity.reset": "Reset name/photo to Google",
  "its.release": "Release ITS#",
  "its.reassign": "Reassign ITS#",
  "account.role": "Change role",
  "account.enable": "Enable account",
  "account.disable": "Disable account",
  "profile.update": "Update profile",
  "tokens.adjust": "Adjust tokens",
  "tokens.request": "Create token request",
  "tokens.request_cancel": "Cancel token request",
  "rsvp.status": "Change RSVP status",
  "billing.freeze_dispute": "Billing freeze (dispute)",
  "billing.dispute_updated": "Billing dispute updated",
  "billing.freeze_manual": "Billing freeze (manual)",
  "billing.unfreeze": "Billing unfreeze",
  "wallet.stripe_mode": "Wallet Stripe mode",
  "token_pricing_config.update": "Update token pricing",
  "token_packages.create": "Create token package",
  "token_packages.update": "Update token package",
  "token_packages.deactivate": "Deactivate token package",
  "weekly_series.update": "Update weekly series",
  "weekly.delete_occurrence": "Delete weekly occurrence",
  "weekly.update_occurrence": "Update weekly occurrence",
  "weekly.rsvp_override": "RSVP window override",
  "weekly.cancel_rsvp": "Cancel weekly RSVP",
  "weekly.remind_token_auth": "Remind token auth",
  "weekly.save_attendance": "Save attendance",
  "weekly.finalize": "Finalize weekly event",
  "weekly.cancel_event": "Cancel weekly event",
  "weekly.no_show": "Mark no-show",
  "weekly.teams_enabled": "Teams enabled/disabled",
  "weekly.teams_lock": "Lock teams",
  "weekly.teams_unlock": "Unlock teams",
  "weekly.teams_announce": "Announce teams",
  "legacy_token.import_staged": "Legacy import staged",
  "legacy_token.go_live": "Legacy import go live",
  "legacy_token.retire": "Legacy import retire",
  "legacy_token.unretire": "Legacy import unretire",
  "legacy_token.revert_go_live": "Legacy import revert",
  "legacy_token.credit": "Legacy token credit",
};

export function adminAuditActionLabel(action: string): string {
  return ADMIN_AUDIT_ACTION_LABELS[action] ?? action;
}

export async function writeAdminAudit(entry: {
  adminUid: string;
  targetUid: string;
  action: string;
  meta?: Record<string, unknown>;
}) {
  const adminDb = getAdminDb();
  await adminDb.collection("adminAudit").add({
    adminUid: entry.adminUid,
    targetUid: entry.targetUid,
    action: entry.action,
    meta: entry.meta ?? {},
    at: FieldValue.serverTimestamp(),
  });
}

export type AdminAuditRow = {
  id: string;
  at: string | null;
  action: string;
  actionLabel: string;
  adminUid: string;
  adminName: string;
  adminEmail: string;
  targetUid: string;
  targetName: string;
  targetEmail: string;
  meta: Record<string, unknown>;
};

export type ListAdminAuditOptions = {
  action?: string;
  adminUid?: string;
  targetUid?: string;
  from?: string | null;
  to?: string | null;
  pageSize?: number;
  cursor?: string | null;
};

export type ListAdminAuditResult = {
  rows: AdminAuditRow[];
  nextCursor: string | null;
};

function isLikelyUserUid(id: string): boolean {
  if (!id) return false;
  if (id === "stripe_webhook") return false;
  if (id.includes(":")) return false;
  return id.length >= 10;
}

function serializeAt(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return null;
}

function displayForSynthetic(id: string): { name: string; email: string } {
  if (id === "stripe_webhook") return { name: "Stripe webhook", email: "" };
  if (id.startsWith("event:")) return { name: `Event ${id.slice(6)}`, email: "" };
  if (id.startsWith("series:")) return { name: `Series ${id.slice(7)}`, email: "" };
  return { name: id || "—", email: "" };
}

async function hydrateUsers(
  adminDb: Firestore,
  uids: string[]
): Promise<Map<string, { name: string; email: string }>> {
  const map = new Map<string, { name: string; email: string }>();
  const unique = [...new Set(uids.filter(isLikelyUserUid))];
  if (unique.length === 0) return map;

  const snaps = await adminDb.getAll(...unique.map((uid) => adminDb.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) {
      map.set(snap.id, { name: snap.id, email: "" });
      continue;
    }
    const d = snap.data() as Record<string, unknown>;
    const name = memberFullName({
      firstName: typeof d.firstName === "string" ? d.firstName : null,
      lastName: typeof d.lastName === "string" ? d.lastName : null,
      displayName: typeof d.displayName === "string" ? d.displayName : null,
    });
    const email = typeof d.email === "string" ? d.email : "";
    map.set(snap.id, { name, email });
  }
  return map;
}

function resolveParty(
  id: string,
  users: Map<string, { name: string; email: string }>
): { name: string; email: string } {
  if (isLikelyUserUid(id)) {
    return users.get(id) ?? { name: id, email: "" };
  }
  return displayForSynthetic(id);
}

function mapDoc(
  doc: QueryDocumentSnapshot,
  users: Map<string, { name: string; email: string }>
): AdminAuditRow {
  const data = doc.data();
  const action = typeof data.action === "string" ? data.action : "";
  const adminUid = typeof data.adminUid === "string" ? data.adminUid : "";
  const targetUid = typeof data.targetUid === "string" ? data.targetUid : "";
  const admin = resolveParty(adminUid, users);
  const target = resolveParty(targetUid, users);
  const meta =
    data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? (data.meta as Record<string, unknown>)
      : {};

  return {
    id: doc.id,
    at: serializeAt(data.at),
    action,
    actionLabel: adminAuditActionLabel(action),
    adminUid,
    adminName: admin.name,
    adminEmail: admin.email,
    targetUid,
    targetName: target.name,
    targetEmail: target.email,
    meta,
  };
}

function buildAuditQuery(
  adminDb: Firestore,
  opts: {
    action?: string;
    adminUid?: string;
    targetUid?: string;
    from?: string | null;
    to?: string | null;
  }
): Query {
  const { start, end } = chicagoDayBounds(
    parseYmdParam(opts.from ?? null),
    parseYmdParam(opts.to ?? null)
  );

  let query: Query = adminDb.collection("adminAudit");

  // At most one equality filter so planned composite indexes cover filtered+ordered queries.
  if (opts.action) {
    query = query.where("action", "==", opts.action);
  } else if (opts.adminUid) {
    query = query.where("adminUid", "==", opts.adminUid);
  } else if (opts.targetUid) {
    query = query.where("targetUid", "==", opts.targetUid);
  }

  if (start) query = query.where("at", ">=", Timestamp.fromDate(start));
  if (end) query = query.where("at", "<=", Timestamp.fromDate(end));
  query = query.orderBy("at", "desc");
  return query;
}

export async function listAdminAuditLogs(
  adminDb: Firestore,
  opts: ListAdminAuditOptions
): Promise<ListAdminAuditResult> {
  const pageSizeRaw = opts.pageSize ?? 50;
  const pageSize = [25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 50;

  let query = buildAuditQuery(adminDb, opts);

  if (opts.cursor) {
    const cursorSnap = await adminDb.collection("adminAudit").doc(opts.cursor).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const uids: string[] = [];
  for (const doc of pageDocs) {
    const d = doc.data();
    if (typeof d.adminUid === "string") uids.push(d.adminUid);
    if (typeof d.targetUid === "string") uids.push(d.targetUid);
  }
  const users = await hydrateUsers(adminDb, uids);
  const rows = pageDocs.map((doc) => mapDoc(doc, users));
  const nextCursor = hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null;

  return { rows, nextCursor };
}

const EXPORT_CAP = 5000;

export type ExportAdminAuditResult = {
  rows: AdminAuditRow[];
  truncated: boolean;
};

export async function exportAdminAuditLogs(
  adminDb: Firestore,
  opts: Omit<ListAdminAuditOptions, "pageSize" | "cursor">
): Promise<ExportAdminAuditResult> {
  let query = buildAuditQuery(adminDb, opts);
  const collected: QueryDocumentSnapshot[] = [];
  let cursorDoc: QueryDocumentSnapshot | null = null;
  let truncated = false;

  while (collected.length < EXPORT_CAP) {
    let pageQuery = query;
    if (cursorDoc) pageQuery = pageQuery.startAfter(cursorDoc);
    const batchSize = Math.min(200, EXPORT_CAP - collected.length + 1);
    const snap = await pageQuery.limit(batchSize).get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      if (collected.length >= EXPORT_CAP) {
        truncated = true;
        break;
      }
      collected.push(doc);
    }

    if (snap.docs.length < batchSize || collected.length >= EXPORT_CAP) {
      if (snap.docs.length >= batchSize && collected.length >= EXPORT_CAP) truncated = true;
      break;
    }
    cursorDoc = snap.docs[snap.docs.length - 1]!;
  }

  const uids: string[] = [];
  for (const doc of collected) {
    const d = doc.data();
    if (typeof d.adminUid === "string") uids.push(d.adminUid);
    if (typeof d.targetUid === "string") uids.push(d.targetUid);
  }
  const users = await hydrateUsers(adminDb, uids);
  return {
    rows: collected.map((doc) => mapDoc(doc, users)),
    truncated,
  };
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function adminAuditRowsToCsv(rows: AdminAuditRow[], truncated: boolean): string {
  const header = csvRow([
    "When",
    "Action",
    "Action label",
    "Actor UID",
    "Actor name",
    "Actor email",
    "Target UID",
    "Target name",
    "Target email",
    "Meta (JSON)",
  ]);
  const lines = [
    header,
    ...rows.map((r) =>
      csvRow([
        r.at ?? "",
        r.action,
        r.actionLabel,
        r.adminUid,
        r.adminName,
        r.adminEmail,
        r.targetUid,
        r.targetName,
        r.targetEmail,
        JSON.stringify(r.meta ?? {}),
      ])
    ),
  ];
  if (truncated) {
    lines.push(
      csvRow(["(truncated)", `Export capped at ${EXPORT_CAP} rows`, "", "", "", "", "", "", "", ""])
    );
  }
  return lines.join("\n") + "\n";
}

export { EXPORT_CAP as ADMIN_AUDIT_EXPORT_CAP };

export function isAdminAuditMemberUid(id: string): boolean {
  return isLikelyUserUid(id);
}
