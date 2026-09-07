import { chicagoDateKey } from "@/lib/chicago-time";
import {
  PAID_REASONS,
  chicagoWeekStart,
  dollarsFromLedgerRow,
  eventIdFromTxRow,
  packageIdFromMeta,
  packageLabelFromMeta,
  paidChannel,
  type TokenReportDollarsMode,
  type TokenReportGroupBy,
  type TokenReportQuery,
} from "@/lib/token-report-query";

export const TOKEN_REPORT_SCAN_CAP = 15_000;
export const TOKEN_REPORT_ROW_SAMPLE = 80;
export const TOKEN_REPORT_TOP_HOLDERS = 25;

export type ReportUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  tokenBalance: number;
};

export type NormalizedLedgerTx = {
  id: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  description: string | null;
  eventId: string;
  packageId: string;
  packageLabel: string;
  counterpartyUid: string | null;
  createdAt: Date | null;
  iso: string | null;
  dollars: number | null;
  livemode: boolean | null;
  signed: number;
};

function toDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function normalizeLedgerTx(id: string, data: Record<string, unknown>): NormalizedLedgerTx {
  const created = toDate(data.createdAt);
  const type: "CREDIT" | "DEBIT" = data.type === "DEBIT" ? "DEBIT" : "CREDIT";
  const amount = typeof data.amount === "number" ? data.amount : 0;
  const livemode = typeof data.stripeLivemode === "boolean" ? data.stripeLivemode : null;
  const cp =
    typeof data.counterpartyUid === "string" && data.counterpartyUid
      ? data.counterpartyUid
      : null;
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    type,
    amount,
    reason: typeof data.reason === "string" ? data.reason : "",
    description: typeof data.description === "string" ? data.description : null,
    eventId: eventIdFromTxRow(data),
    packageId: packageIdFromMeta(data.meta),
    packageLabel: packageLabelFromMeta(data.meta),
    counterpartyUid: cp,
    createdAt: created,
    iso: created ? created.toISOString() : null,
    dollars: dollarsFromLedgerRow(data),
    livemode,
    signed: type === "CREDIT" ? amount : -amount,
  };
}

function dollarsEligible(tx: NormalizedLedgerTx, mode: TokenReportDollarsMode): boolean {
  if (tx.dollars == null) return false;
  if (mode === "all") return true;
  if (mode === "live") return tx.livemode === true;
  return tx.livemode === false;
}

function paidDollars(tx: NormalizedLedgerTx, mode: TokenReportDollarsMode): number {
  if (!(PAID_REASONS as readonly string[]).includes(tx.reason)) return 0;
  if (!dollarsEligible(tx, mode)) return 0;
  return tx.dollars ?? 0;
}

type Bucket = {
  key: string;
  label: string;
  tokensCredit: number;
  tokensDebit: number;
  net: number;
  count: number;
  dollars: number;
  tokensPaidWithDollars: number;
  members: Set<string>;
};

function emptyBucket(key: string, label: string): Bucket {
  return {
    key,
    label,
    tokensCredit: 0,
    tokensDebit: 0,
    net: 0,
    count: 0,
    dollars: 0,
    tokensPaidWithDollars: 0,
    members: new Set(),
  };
}

function addToBucket(b: Bucket, tx: NormalizedLedgerTx, dollarsMode: TokenReportDollarsMode) {
  b.count += 1;
  if (tx.type === "CREDIT") b.tokensCredit += tx.amount;
  else b.tokensDebit += tx.amount;
  b.net += tx.signed;
  if (tx.userId) b.members.add(tx.userId);
  const d = paidDollars(tx, dollarsMode);
  if (d > 0) {
    b.dollars += d;
    b.tokensPaidWithDollars += tx.amount;
  }
}

function serializeBuckets(buckets: Map<string, Bucket>, sort: "absNet" | "dollars" | "count") {
  const rows = [...buckets.values()].map((b) => ({
    key: b.key,
    label: b.label,
    tokensCredit: b.tokensCredit,
    tokensDebit: b.tokensDebit,
    net: b.net,
    count: b.count,
    dollars: b.dollars,
    avgDollarsPerToken:
      b.tokensPaidWithDollars > 0 ? b.dollars / b.tokensPaidWithDollars : null,
    uniqueMembers: b.members.size,
  }));
  rows.sort((a, b) => {
    if (sort === "dollars") return b.dollars - a.dollars;
    if (sort === "count") return b.count - a.count;
    return Math.abs(b.net) - Math.abs(a.net) || b.count - a.count;
  });
  return rows;
}

function memberName(users: Map<string, ReportUser>, uid: string): string {
  const u = users.get(uid);
  if (!u) return uid || "Unknown";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || u.email || uid;
}

function groupKey(
  tx: NormalizedLedgerTx,
  groupBy: TokenReportGroupBy,
  users: Map<string, ReportUser>,
  eventTitles: Map<string, string>,
  packageTitles: Map<string, string>
): { key: string; label: string } | null {
  if (groupBy === "none") return null;
  if (groupBy === "reason") {
    return { key: tx.reason || "unknown", label: tx.reason || "unknown" };
  }
  if (groupBy === "event") {
    const id = tx.eventId || "none";
    return { key: id, label: id === "none" ? "No event" : eventTitles.get(id) || id };
  }
  if (groupBy === "member") {
    return { key: tx.userId || "unknown", label: memberName(users, tx.userId) };
  }
  if (groupBy === "package") {
    const id = tx.packageId || "unknown";
    const label =
      tx.packageLabel || packageTitles.get(id) || (id === "unknown" ? "Unknown package" : id);
    return { key: id, label };
  }
  if (groupBy === "channel") {
    const ch = paidChannel(tx.reason) || "other";
    return { key: ch, label: ch };
  }
  if (!tx.createdAt) return { key: "unknown", label: "Unknown date" };
  const ymd = chicagoDateKey(tx.createdAt);
  if (groupBy === "day") return { key: ymd, label: ymd };
  if (groupBy === "week") {
    const start = chicagoWeekStart(ymd);
    return { key: start, label: `Week of ${start}` };
  }
  const month = ymd.slice(0, 7);
  return { key: month, label: month };
}

export type TokenRequestSnap = {
  id: string;
  memberUid: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string | null;
  resolvedAt: string | null;
};

export function buildTokenReport(opts: {
  query: TokenReportQuery;
  txs: NormalizedLedgerTx[];
  truncated: boolean;
  users: ReportUser[];
  eventTitles: Map<string, string>;
  packageTitles: Map<string, string>;
  tokenRequests: TokenRequestSnap[];
}) {
  const { query, txs, truncated, eventTitles, packageTitles, tokenRequests } = opts;
  const userMap = new Map(opts.users.map((u) => [u.id, u]));

  const circulationTokens = opts.users.reduce((s, u) => s + (u.tokenBalance || 0), 0);
  const membersWithBalance = opts.users.filter((u) => (u.tokenBalance || 0) > 0).length;
  const topHolders = [...opts.users]
    .filter((u) => (u.tokenBalance || 0) > 0)
    .sort((a, b) => b.tokenBalance - a.tokenBalance)
    .slice(0, TOKEN_REPORT_TOP_HOLDERS)
    .map((u) => ({
      userId: u.id,
      name: memberName(userMap, u.id),
      email: u.email,
      balance: u.tokenBalance,
    }));

  const filtered = txs.filter((tx) => {
    if (query.reasons.length && !query.reasons.includes(tx.reason)) return false;
    if (query.type !== "all" && tx.type !== query.type) return false;
    if (query.userId && tx.userId !== query.userId) return false;
    if (query.eventId && tx.eventId !== query.eventId) return false;
    return true;
  });

  const mode = query.dollarsMode;

  let mintedPaid = 0;
  let mintedAdmin = 0;
  let mintedLegacy = 0;
  let adminRemoved = 0;
  let requestCollected = 0;
  let eventNet = 0;
  let transferred = 0;
  let dollarsEarned = 0;
  let tokensPurchasedPaid = 0;
  let paidMissingDollars = 0;
  let paidTokenCredits = 0;

  const byReason = new Map<string, Bucket>();
  const channels = new Map<string, Bucket>();
  const packages = new Map<string, Bucket>();
  const events = new Map<string, Bucket>();
  const groups = new Map<string, Bucket>();
  const transferSenders = new Set<string>();
  const transferReceivers = new Set<string>();
  const transferPairs = new Map<string, { tokens: number; count: number }>();
  let transferOutCount = 0;
  let unitTx = 0;
  let unitTokens = 0;
  let unitDollars = 0;
  let unitMembers = new Set<string>();
  let adminAddTokens = 0;
  let adminAddCount = 0;
  let adminAddMembers = new Set<string>();
  let adminRemoveTokens = 0;
  let adminRemoveCount = 0;
  let adminRemoveMembers = new Set<string>();
  let requestLedgerTokens = 0;
  let requestLedgerCount = 0;
  let requestLedgerMembers = new Set<string>();

  for (const tx of filtered) {
    const rb = byReason.get(tx.reason) ?? emptyBucket(tx.reason, tx.reason);
    addToBucket(rb, tx, mode);
    byReason.set(tx.reason, rb);

    if ((PAID_REASONS as readonly string[]).includes(tx.reason) && tx.type === "CREDIT") {
      mintedPaid += tx.amount;
      paidTokenCredits += tx.amount;
      const d = paidDollars(tx, mode);
      if (d > 0) {
        dollarsEarned += d;
        tokensPurchasedPaid += tx.amount;
      } else if (tx.dollars == null) {
        paidMissingDollars += 1;
      }
      const ch = paidChannel(tx.reason);
      if (ch) {
        const cb = channels.get(ch) ?? emptyBucket(ch, ch);
        addToBucket(cb, tx, mode);
        channels.set(ch, cb);
      }
      if (tx.reason !== "unit_purchase") {
        const pid = tx.packageId || "unknown";
        const label =
          tx.packageLabel ||
          packageTitles.get(pid) ||
          (pid === "unknown" ? "Unknown package" : pid);
        const pb = packages.get(pid) ?? emptyBucket(pid, label);
        addToBucket(pb, tx, mode);
        packages.set(pid, pb);
      }
      if (tx.reason === "unit_purchase") {
        unitTx += 1;
        unitTokens += tx.amount;
        unitDollars += d;
        if (tx.userId) unitMembers.add(tx.userId);
      }
    }

    if (tx.reason === "admin_adjust") {
      if (tx.type === "CREDIT") {
        mintedAdmin += tx.amount;
        adminAddTokens += tx.amount;
        adminAddCount += 1;
        if (tx.userId) adminAddMembers.add(tx.userId);
      } else {
        adminRemoved += tx.amount;
        adminRemoveTokens += tx.amount;
        adminRemoveCount += 1;
        if (tx.userId) adminRemoveMembers.add(tx.userId);
      }
    }

    if (tx.reason === "legacy_import" && tx.type === "CREDIT") {
      mintedLegacy += tx.amount;
    }

    if (tx.reason === "token_request" && tx.type === "DEBIT") {
      requestCollected += tx.amount;
      requestLedgerTokens += tx.amount;
      requestLedgerCount += 1;
      if (tx.userId) requestLedgerMembers.add(tx.userId);
    }

    if (tx.eventId && (tx.reason.startsWith("rsvp") || tx.reason === "rsvp")) {
      eventNet += tx.type === "DEBIT" ? tx.amount : -tx.amount;
      const eb = events.get(tx.eventId) ?? emptyBucket(tx.eventId, eventTitles.get(tx.eventId) || tx.eventId);
      addToBucket(eb, tx, mode);
      events.set(tx.eventId, eb);
    }

    if (tx.reason === "transfer_out") {
      transferred += tx.amount;
      transferOutCount += 1;
      if (tx.userId) transferSenders.add(tx.userId);
      if (tx.counterpartyUid) transferReceivers.add(tx.counterpartyUid);
      const pairKey = `${tx.userId}→${tx.counterpartyUid || "?"}`;
      const prev = transferPairs.get(pairKey) ?? { tokens: 0, count: 0 };
      prev.tokens += tx.amount;
      prev.count += 1;
      transferPairs.set(pairKey, prev);
    }
    if (tx.reason === "transfer_in" && tx.userId) transferReceivers.add(tx.userId);

    const gk = groupKey(tx, query.groupBy, userMap, eventTitles, packageTitles);
    if (gk) {
      const gb = groups.get(gk.key) ?? emptyBucket(gk.key, gk.label);
      addToBucket(gb, tx, mode);
      groups.set(gk.key, gb);
    }
  }

  const pendingRequests = tokenRequests.filter((r) => r.status === "pending");
  const periodStart = query.from;
  const periodEnd = query.to;
  const inRange = (iso: string | null) => {
    if (!iso) return !periodStart && !periodEnd;
    const ymd = chicagoDateKey(new Date(iso));
    if (periodStart && ymd < periodStart) return false;
    if (periodEnd && ymd > periodEnd) return false;
    return true;
  };
  const paidReqs = tokenRequests.filter((r) => r.status === "paid" && inRange(r.resolvedAt || r.createdAt));
  const cancelledReqs = tokenRequests.filter(
    (r) => r.status === "cancelled" && inRange(r.resolvedAt || r.createdAt)
  );

  const rows = [...filtered]
    .sort((a, b) => (b.iso || "").localeCompare(a.iso || ""))
    .slice(0, TOKEN_REPORT_ROW_SAMPLE)
    .map((tx) => ({
      id: tx.id,
      createdAt: tx.iso,
      userId: tx.userId,
      name: memberName(userMap, tx.userId),
      email: userMap.get(tx.userId)?.email ?? "",
      type: tx.type,
      amount: tx.amount,
      reason: tx.reason,
      description: tx.description,
      eventId: tx.eventId || null,
      eventLabel: tx.eventId ? eventTitles.get(tx.eventId) || tx.eventId : null,
      dollars: dollarsEligible(tx, mode) ? tx.dollars : null,
      livemode: tx.livemode,
    }));

  const ledgerNet = filtered.reduce((s, tx) => s + tx.signed, 0);

  return {
    parsedQuery: query,
    truncated,
    circulation: {
      totalTokens: circulationTokens,
      membersWithBalance,
      memberCount: opts.users.length,
      topHolders,
    },
    supply: {
      mintedPaid,
      mintedAdmin,
      mintedLegacy,
      mintedTotal: mintedAdmin + mintedLegacy,
      adminRemoved,
      requestCollected,
      eventNet,
      transferred,
      dollarsEarned,
      tokensPurchasedPaid,
      avgDollarsPerToken:
        tokensPurchasedPaid > 0 ? dollarsEarned / tokensPurchasedPaid : null,
      paidMissingDollars,
      paidTokenCredits,
      ledgerNet,
    },
    byReason: serializeBuckets(byReason, query.metric === "dollars" ? "dollars" : "absNet"),
    channels: serializeBuckets(channels, "count"),
    packages: serializeBuckets(packages, "count"),
    unitBuys: {
      count: unitTx,
      tokens: unitTokens,
      dollars: unitDollars,
      uniqueMembers: unitMembers.size,
      avgDollarsPerToken: unitTokens > 0 && unitDollars > 0 ? unitDollars / unitTokens : null,
    },
    admin: {
      addTokens: adminAddTokens,
      addCount: adminAddCount,
      addMembers: adminAddMembers.size,
      removeTokens: adminRemoveTokens,
      removeCount: adminRemoveCount,
      removeMembers: adminRemoveMembers.size,
    },
    requests: {
      ledgerTokens: requestLedgerTokens,
      ledgerCount: requestLedgerCount,
      ledgerMembers: requestLedgerMembers.size,
      pendingCount: pendingRequests.length,
      pendingTokens: pendingRequests.reduce((s, r) => s + r.amount, 0),
      paidInPeriodCount: paidReqs.length,
      paidInPeriodTokens: paidReqs.reduce((s, r) => s + r.amount, 0),
      cancelledInPeriodCount: cancelledReqs.length,
    },
    transfers: {
      tokensChangingHands: transferred,
      count: transferOutCount,
      uniqueSenders: transferSenders.size,
      uniqueReceivers: transferReceivers.size,
      topPairs: [...transferPairs.entries()]
        .sort((a, b) => b[1].tokens - a[1].tokens)
        .slice(0, 15)
        .map(([key, v]) => {
          const [from, to] = key.split("→");
          return {
            fromId: from,
            toId: to,
            fromName: memberName(userMap, from || ""),
            toName: memberName(userMap, to || ""),
            tokens: v.tokens,
            count: v.count,
          };
        }),
    },
    events: serializeBuckets(events, "absNet"),
    groups: serializeBuckets(groups, query.metric === "dollars" ? "dollars" : "absNet"),
    rows,
  };
}

export type TokenReportResponse = ReturnType<typeof buildTokenReport>;
