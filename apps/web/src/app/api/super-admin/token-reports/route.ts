import { NextRequest, NextResponse } from "next/server";
import { FieldPath, Timestamp, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSuperAdmin } from "@/lib/auth/server-auth";
import { chicagoDayBounds, parseYmdParam } from "@/lib/ymd-range";
import { TOKEN_REQUESTS_COLLECTION, serializeTokenRequest } from "@/lib/token-request";
import {
  queryFromSearchParams,
  type TokenReportQuery,
} from "@/lib/token-report-query";
import { reportDownloadBasename, tokenReportToCsv } from "@/lib/token-report-export";
import {
  TOKEN_REPORT_SCAN_CAP,
  buildTokenReport,
  normalizeLedgerTx,
  type ReportUser,
  type TokenRequestSnap,
  type TokenReportResponse,
} from "@/lib/token-report-build";
import {
  buildWeeklyEconomicsReport,
  weeklyEventFromDoc,
} from "@/lib/weekly-economics-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ECONOMICS_LEDGER_CAP = 40_000;

async function loadUsers(adminDb: Firestore): Promise<ReportUser[]> {
  const users: ReportUser[] = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = adminDb.collection("users").orderBy(FieldPath.documentId()).limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const d = doc.data();
      users.push({
        id: doc.id,
        firstName: typeof d.firstName === "string" ? d.firstName : "",
        lastName: typeof d.lastName === "string" ? d.lastName : "",
        email: typeof d.email === "string" ? d.email : "",
        tokenBalance: typeof d.tokenBalance === "number" ? d.tokenBalance : 0,
      });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  return users;
}

async function loadLedger(
  adminDb: Firestore,
  query: TokenReportQuery
): Promise<{ txs: ReturnType<typeof normalizeLedgerTx>[]; truncated: boolean }> {
  const { start, end } = chicagoDayBounds(parseYmdParam(query.from), parseYmdParam(query.to));
  const txs: ReturnType<typeof normalizeLedgerTx>[] = [];
  let last: QueryDocumentSnapshot | undefined;
  let truncated = false;

  for (;;) {
    let q: Query = adminDb
      .collection("token_transactions")
      .orderBy("createdAt", "desc");
    if (start) q = q.where("createdAt", ">=", Timestamp.fromDate(start));
    if (end) q = q.where("createdAt", "<=", Timestamp.fromDate(end));
    q = q.limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      txs.push(normalizeLedgerTx(doc.id, doc.data() as Record<string, unknown>));
      if (txs.length >= TOKEN_REPORT_SCAN_CAP) {
        truncated = true;
        break;
      }
    }
    last = snap.docs[snap.docs.length - 1];
    if (truncated || snap.size < 500) break;
  }
  return { txs, truncated };
}

/** Full ledger for FIFO (ascending). Needed so purchase/legacy history precedes event usage. */
async function loadLedgerForEconomics(
  adminDb: Firestore
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const rows: Array<{ id: string; data: Record<string, unknown> }> = [];
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let q: Query = adminDb
      .collection("token_transactions")
      .orderBy("createdAt", "asc")
      .limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      rows.push({ id: doc.id, data: doc.data() as Record<string, unknown> });
      if (rows.length >= ECONOMICS_LEDGER_CAP) return rows;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  return rows;
}

async function loadWeeklyEventsInRange(
  adminDb: Firestore,
  query: TokenReportQuery
) {
  const { start, end } = chicagoDayBounds(parseYmdParam(query.from), parseYmdParam(query.to));
  let q: Query = adminDb.collection("events").where("category", "==", "WEEKLY_SPORTS");
  if (start) q = q.where("startTime", ">=", Timestamp.fromDate(start));
  if (end) q = q.where("startTime", "<=", Timestamp.fromDate(end));
  q = q.orderBy("startTime", "desc").limit(500);

  try {
    const snap = await q.get();
    return snap.docs
      .map((doc) => weeklyEventFromDoc(doc.id, doc.data() as Record<string, unknown>))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
  } catch (err) {
    // Composite index may be missing — fall back to category-only scan + filter.
    console.warn("weekly events range query failed, falling back:", err);
    const snap = await adminDb
      .collection("events")
      .where("category", "==", "WEEKLY_SPORTS")
      .limit(1000)
      .get();
    const events = snap.docs
      .map((doc) => weeklyEventFromDoc(doc.id, doc.data() as Record<string, unknown>))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    return events.filter((e) => {
      if (!e.startTime) return !start && !end;
      if (start && e.startTime < start) return false;
      if (end && e.startTime > end) return false;
      return true;
    });
  }
}

async function mapByIds(
  adminDb: Firestore,
  collection: string,
  ids: string[],
  pick: (data: Record<string, unknown>) => string
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const snaps = await adminDb.getAll(...chunk.map((id) => adminDb.collection(collection).doc(id)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const label = pick(snap.data() ?? {});
      if (label) map.set(snap.id, label);
    }
  }
  return map;
}

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const query = queryFromSearchParams(new URL(request.url).searchParams);
  const adminDb = getAdminDb();
  const wantEconomics =
    query.focus === "weekly_economics" ||
    query.focus === "overview" ||
    query.groupBy === "sport" ||
    query.groupBy === "series";

  try {
    const [{ txs, truncated }, users, weeklyEvents, economicsLedger] = await Promise.all([
      loadLedger(adminDb, query),
      loadUsers(adminDb),
      wantEconomics ? loadWeeklyEventsInRange(adminDb, query) : Promise.resolve([]),
      wantEconomics ? loadLedgerForEconomics(adminDb) : Promise.resolve([]),
    ]);

    const eventIds = [
      ...txs.map((t) => t.eventId),
      ...weeklyEvents.map((e) => e.id),
    ];
    const packageIds = txs.map((t) => t.packageId);
    const seriesIds = weeklyEvents.map((e) => e.seriesId).filter(Boolean) as string[];
    const sportIds = weeklyEvents.map((e) => e.sportId).filter(Boolean);
    const extraUids = new Set(users.map((u) => u.id));
    for (const tx of txs) {
      extraUids.add(tx.userId);
      if (tx.counterpartyUid) extraUids.add(tx.counterpartyUid);
    }

    const missingUserIds = [...extraUids].filter((id) => !users.some((u) => u.id === id));
    if (missingUserIds.length) {
      for (let i = 0; i < missingUserIds.length; i += 100) {
        const chunk = missingUserIds.slice(i, i + 100);
        const snaps = await adminDb.getAll(...chunk.map((id) => adminDb.collection("users").doc(id)));
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const d = snap.data() ?? {};
          users.push({
            id: snap.id,
            firstName: typeof d.firstName === "string" ? d.firstName : "",
            lastName: typeof d.lastName === "string" ? d.lastName : "",
            email: typeof d.email === "string" ? d.email : "",
            tokenBalance: typeof d.tokenBalance === "number" ? d.tokenBalance : 0,
          });
        }
      }
    }

    let tokenRequests: TokenRequestSnap[] = [];
    try {
      const reqSnap = await adminDb.collection(TOKEN_REQUESTS_COLLECTION).get();
      tokenRequests = reqSnap.docs.map((doc) => {
        const rec = serializeTokenRequest(doc.id, doc.data() as Record<string, unknown>);
        return {
          id: rec.id,
          memberUid: rec.memberUid,
          amount: rec.amount,
          reason: rec.reason,
          status: rec.status,
          createdAt: rec.createdAt,
          resolvedAt: rec.resolvedAt,
        };
      });
    } catch (err) {
      console.warn("tokenRequests scan failed", err);
    }

    const [eventTitles, packageTitles, seriesLabels, sportLabels] = await Promise.all([
      mapByIds(adminDb, "events", eventIds, (d) => {
        if (typeof d.slug === "string" && d.slug) return d.slug;
        if (typeof d.title === "string" && d.title) return d.title;
        return "";
      }),
      mapByIds(adminDb, "tokenPackages", packageIds, (d) => {
        if (typeof d.label === "string" && d.label) return d.label;
        const n = Number(d.tokenAmount);
        return Number.isFinite(n) && n > 0 ? `${n} tokens` : "";
      }),
      mapByIds(adminDb, "weeklySeries", seriesIds, (d) => {
        const adminLabel = typeof d.adminLabel === "string" ? d.adminLabel.trim() : "";
        if (adminLabel) return adminLabel;
        if (typeof d.title === "string" && d.title) return d.title;
        return "";
      }),
      mapByIds(adminDb, "managedSports", sportIds, (d) => {
        if (typeof d.label === "string" && d.label) return d.label;
        if (typeof d.name === "string" && d.name) return d.name;
        return "";
      }),
    ]);

    // Fallback sport labels from catalog id when managedSports miss
    for (const id of sportIds) {
      if (!sportLabels.has(id) && id) sportLabels.set(id, id);
    }

    const baseReport = buildTokenReport({
      query,
      txs,
      truncated,
      users,
      eventTitles,
      packageTitles,
      tokenRequests,
    });

    let weeklyEconomics: TokenReportResponse["weeklyEconomics"] = null;
    if (wantEconomics) {
      weeklyEconomics = buildWeeklyEconomicsReport({
        events: weeklyEvents,
        ledgerRaw: economicsLedger,
        groupBy: query.groupBy,
        sportLabels,
        seriesLabels,
      });
    }

    const report: TokenReportResponse = {
      ...baseReport,
      weeklyEconomics,
    };

    const format = new URL(request.url).searchParams.get("format");
    const base = reportDownloadBasename(query);
    if (format === "csv") {
      const csv = tokenReportToCsv(report);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load token report";
    console.error("token-reports API", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
