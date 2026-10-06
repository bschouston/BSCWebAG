/**
 * Weekly token economics: frozen mint basis + per-user FIFO source attribution.
 * Never read live package/unit catalog prices for historical value.
 */

import { dollarsFromLedgerRow } from "@/lib/token-report-query";

export const LEGACY_TOKEN_USD = 1.15;
/** v2: only admin_adjust is free@$0; unknown/shortfall lots use legacy@$1.15 (not free). */
export const ECONOMICS_METHOD = "per_user_fifo_v2" as const;

export type TokenSource = "legacy" | "purchased" | "free";

export type PaidMintMeta = {
  amountCents: number;
  amountTotal: number;
  usdPerToken: number;
  currency: string;
};

/** Freeze charged dollars onto a paid credit meta blob. */
export function paidMintMeta(amountCents: number, tokenAmount: number, currency = "usd"): PaidMintMeta {
  const cents = Math.max(0, Math.round(amountCents));
  const tokens = Math.max(1, Math.floor(tokenAmount));
  const usd = cents / 100;
  return {
    amountCents: cents,
    amountTotal: cents,
    usdPerToken: tokens > 0 ? usd / tokens : 0,
    currency: String(currency || "usd").toLowerCase(),
  };
}

export type TokenLot = {
  source: TokenSource;
  tokens: number;
  usdPerToken: number;
};

export type SourceBreakdown = {
  tokensLegacy: number;
  tokensPurchased: number;
  tokensFree: number;
  valueLegacyUsd: number;
  valuePurchasedUsd: number;
  valueFreeUsd: number;
};

export function emptySourceBreakdown(): SourceBreakdown {
  return {
    tokensLegacy: 0,
    tokensPurchased: 0,
    tokensFree: 0,
    valueLegacyUsd: 0,
    valuePurchasedUsd: 0,
    valueFreeUsd: 0,
  };
}

export function totalTokens(b: SourceBreakdown): number {
  return b.tokensLegacy + b.tokensPurchased + b.tokensFree;
}

export function totalValueUsd(b: SourceBreakdown): number {
  return b.valueLegacyUsd + b.valuePurchasedUsd + b.valueFreeUsd;
}

function addSlice(b: SourceBreakdown, source: TokenSource, tokens: number, usdPerToken: number) {
  if (tokens <= 0) return;
  const usd = tokens * usdPerToken;
  if (source === "legacy") {
    b.tokensLegacy += tokens;
    b.valueLegacyUsd += usd;
  } else if (source === "purchased") {
    b.tokensPurchased += tokens;
    b.valuePurchasedUsd += usd;
  } else {
    b.tokensFree += tokens;
    b.valueFreeUsd += usd;
  }
}

function subSlice(b: SourceBreakdown, source: TokenSource, tokens: number, usdPerToken: number) {
  if (tokens <= 0) return;
  const usd = tokens * usdPerToken;
  if (source === "legacy") {
    b.tokensLegacy = Math.max(0, b.tokensLegacy - tokens);
    b.valueLegacyUsd = Math.max(0, b.valueLegacyUsd - usd);
  } else if (source === "purchased") {
    b.tokensPurchased = Math.max(0, b.tokensPurchased - tokens);
    b.valuePurchasedUsd = Math.max(0, b.valuePurchasedUsd - usd);
  } else {
    b.tokensFree = Math.max(0, b.tokensFree - tokens);
    b.valueFreeUsd = Math.max(0, b.valueFreeUsd - usd);
  }
}

export type EconomicsLedgerTx = {
  id: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  eventId: string;
  transferId: string | null;
  counterpartyUid: string | null;
  createdAt: Date | null;
  /** Dollars on paid credits (already /100), null if unknown */
  dollars: number | null;
  meta?: Record<string, unknown> | null;
};

const PAID_REASONS = new Set([
  "purchase",
  "package_purchase",
  "unit_purchase",
  "auto_replenish",
]);

const EVENT_REFUND_REASONS = new Set([
  "rsvp_settle_refund",
  "rsvp_cancel_refund",
]);

type LotSlice = { source: TokenSource; tokens: number; usdPerToken: number };

export function sourceFromCreditReason(reason: string): TokenSource {
  if (reason === "legacy_import") return "legacy";
  if (PAID_REASONS.has(reason)) return "purchased";
  // Only explicit admin mints are $0. Anything else unknown defaults to legacy
  // valuation — never invent "free" lots (that inflated Free usage vs admin mint).
  if (reason === "admin_adjust") return "free";
  return "legacy";
}

/** Basis used when FIFO cannot prove provenance (shortfall, unpaired transfer, etc.). */
function unknownBasisLot(tokens: number): LotSlice {
  return { source: "legacy", tokens, usdPerToken: LEGACY_TOKEN_USD };
}

export function usdPerTokenFromCredit(tx: EconomicsLedgerTx): number {
  const source = sourceFromCreditReason(tx.reason);
  if (source === "legacy") return LEGACY_TOKEN_USD;
  if (source === "free") return 0;
  const meta = tx.meta;
  if (meta && typeof meta === "object") {
    const frozen = (meta as { usdPerToken?: unknown }).usdPerToken;
    if (typeof frozen === "number" && Number.isFinite(frozen) && frozen >= 0) {
      return frozen;
    }
  }
  if (tx.dollars != null && tx.amount > 0) return tx.dollars / tx.amount;
  return 0;
}

function consumeLots(lots: TokenLot[], amount: number): LotSlice[] {
  let left = amount;
  const slices: LotSlice[] = [];
  while (left > 0 && lots.length > 0) {
    const lot = lots[0]!;
    const take = Math.min(lot.tokens, left);
    slices.push({ source: lot.source, tokens: take, usdPerToken: lot.usdPerToken });
    lot.tokens -= take;
    left -= take;
    if (lot.tokens <= 0) lots.shift();
  }
  if (left > 0) {
    // Incomplete ledger / pre-history balance: assume legacy blended rate, not free@$0.
    slices.push(unknownBasisLot(left));
  }
  return slices;
}

function pushLots(lots: TokenLot[], slices: LotSlice[]) {
  for (const s of slices) {
    if (s.tokens <= 0) continue;
    const last = lots[lots.length - 1];
    if (last && last.source === s.source && last.usdPerToken === s.usdPerToken) {
      last.tokens += s.tokens;
    } else {
      lots.push({ source: s.source, tokens: s.tokens, usdPerToken: s.usdPerToken });
    }
  }
}

export type EventEconomicsNet = SourceBreakdown & {
  eventId: string;
  tokensNet: number;
  valueUsd: number;
};

export type WeeklyEconomicsSnapshot = SourceBreakdown & {
  tokensNet: number;
  valueUsd: number;
  computedAt: string;
  method: typeof ECONOMICS_METHOD;
};

/**
 * Replay ledger chronologically; attribute net token retention per eventId via FIFO lots.
 * Transfer_out/in carry lot basis via transferId.
 */
export function attributeEventTokenUsage(txs: EconomicsLedgerTx[]): {
  byEvent: Map<string, SourceBreakdown>;
  legacyMintedTokens: number;
  purchasedMintedTokens: number;
  freeMintedTokens: number;
  purchasedMintedUsd: number;
} {
  const sorted = [...txs].sort((a, b) => {
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  const lotsByUser = new Map<string, TokenLot[]>();
  const transferLots = new Map<string, LotSlice[]>();
  const byEvent = new Map<string, SourceBreakdown>();
  /** Stack of consumed slices per user+event for refund restore */
  const eventConsumeStack = new Map<string, LotSlice[]>();

  let legacyMintedTokens = 0;
  let purchasedMintedTokens = 0;
  let freeMintedTokens = 0;
  let purchasedMintedUsd = 0;

  const getLots = (uid: string) => {
    let lots = lotsByUser.get(uid);
    if (!lots) {
      lots = [];
      lotsByUser.set(uid, lots);
    }
    return lots;
  };

  const eventKey = (uid: string, eventId: string) => `${uid}::${eventId}`;

  for (const tx of sorted) {
    if (!tx.userId || tx.amount <= 0) continue;
    const lots = getLots(tx.userId);

    if (tx.type === "CREDIT") {
      if (tx.reason === "transfer_in" && tx.transferId) {
        const carried = transferLots.get(tx.transferId);
        if (carried && carried.length) {
          let need = tx.amount;
          const toPush: LotSlice[] = [];
          for (const s of carried) {
            if (need <= 0) break;
            const take = Math.min(s.tokens, need);
            toPush.push({ ...s, tokens: take });
            need -= take;
          }
          if (need > 0) toPush.push(unknownBasisLot(need));
          pushLots(lots, toPush);
        } else {
          // transfer_out not seen yet (ordering) or missing — do not treat as admin free mint
          pushLots(lots, [unknownBasisLot(tx.amount)]);
        }
      } else if (EVENT_REFUND_REASONS.has(tx.reason) && tx.eventId) {
        const key = eventKey(tx.userId, tx.eventId);
        const stack = eventConsumeStack.get(key) ?? [];
        let need = tx.amount;
        const restored: LotSlice[] = [];
        while (need > 0 && stack.length > 0) {
          const top = stack[stack.length - 1]!;
          const take = Math.min(top.tokens, need);
          restored.push({ source: top.source, tokens: take, usdPerToken: top.usdPerToken });
          top.tokens -= take;
          need -= take;
          if (top.tokens <= 0) stack.pop();
        }
        if (need > 0) {
          restored.push(unknownBasisLot(need));
        }
        eventConsumeStack.set(key, stack);
        pushLots(lots, restored);
        const ev = byEvent.get(tx.eventId) ?? emptySourceBreakdown();
        for (const s of restored) subSlice(ev, s.source, s.tokens, s.usdPerToken);
        byEvent.set(tx.eventId, ev);
      } else if (
        tx.reason === "transfer_in" ||
        EVENT_REFUND_REASONS.has(tx.reason)
      ) {
        // Refund/transfer credit without pairing metadata — legacy basis, not free
        pushLots(lots, [unknownBasisLot(tx.amount)]);
      } else {
        const source = sourceFromCreditReason(tx.reason);
        const usdPerToken =
          source === "legacy"
            ? LEGACY_TOKEN_USD
            : source === "free"
              ? 0
              : usdPerTokenFromCredit(tx);
        pushLots(lots, [{ source, tokens: tx.amount, usdPerToken }]);
        if (source === "legacy" && tx.reason === "legacy_import") {
          legacyMintedTokens += tx.amount;
        } else if (source === "purchased") {
          purchasedMintedTokens += tx.amount;
          purchasedMintedUsd += tx.dollars ?? usdPerToken * tx.amount;
        } else if (source === "free") {
          freeMintedTokens += tx.amount;
        }
      }
      continue;
    }

    // DEBIT
    const slices = consumeLots(lots, tx.amount);
    if (tx.reason === "transfer_out" && tx.transferId) {
      transferLots.set(tx.transferId, slices);
    }
    if (tx.eventId) {
      const key = eventKey(tx.userId, tx.eventId);
      const stack = eventConsumeStack.get(key) ?? [];
      stack.push(...slices);
      eventConsumeStack.set(key, stack);
      const ev = byEvent.get(tx.eventId) ?? emptySourceBreakdown();
      for (const s of slices) addSlice(ev, s.source, s.tokens, s.usdPerToken);
      byEvent.set(tx.eventId, ev);
    }
  }

  return {
    byEvent,
    legacyMintedTokens,
    purchasedMintedTokens,
    freeMintedTokens,
    purchasedMintedUsd,
  };
}

export function breakdownToSnapshot(b: SourceBreakdown, at = new Date()): WeeklyEconomicsSnapshot {
  return {
    ...b,
    tokensNet: totalTokens(b),
    valueUsd: totalValueUsd(b),
    computedAt: at.toISOString(),
    method: ECONOMICS_METHOD,
  };
}

export function parseEconomicsSnapshot(raw: unknown): WeeklyEconomicsSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.method !== ECONOMICS_METHOD) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    tokensLegacy: num(o.tokensLegacy),
    tokensPurchased: num(o.tokensPurchased),
    tokensFree: num(o.tokensFree),
    valueLegacyUsd: num(o.valueLegacyUsd),
    valuePurchasedUsd: num(o.valuePurchasedUsd),
    valueFreeUsd: num(o.valueFreeUsd),
    tokensNet: num(o.tokensNet),
    valueUsd: num(o.valueUsd),
    computedAt: typeof o.computedAt === "string" ? o.computedAt : "",
    method: ECONOMICS_METHOD,
  };
}

export function economicsTxFromRaw(id: string, data: Record<string, unknown>): EconomicsLedgerTx {
  const created =
    data.createdAt &&
    typeof data.createdAt === "object" &&
    "toDate" in data.createdAt &&
    typeof (data.createdAt as { toDate: () => Date }).toDate === "function"
      ? (data.createdAt as { toDate: () => Date }).toDate()
      : data.createdAt instanceof Date
        ? data.createdAt
        : null;
  return {
    id,
    userId: typeof data.userId === "string" ? data.userId : "",
    type: data.type === "DEBIT" ? "DEBIT" : "CREDIT",
    amount: typeof data.amount === "number" ? data.amount : 0,
    reason: typeof data.reason === "string" ? data.reason : "",
    eventId: typeof data.eventId === "string" ? data.eventId : "",
    transferId: typeof data.transferId === "string" && data.transferId ? data.transferId : null,
    counterpartyUid:
      typeof data.counterpartyUid === "string" && data.counterpartyUid
        ? data.counterpartyUid
        : null,
    createdAt: created,
    dollars: dollarsFromLedgerRow(data),
    meta: data.meta && typeof data.meta === "object" ? (data.meta as Record<string, unknown>) : null,
  };
}

export type WeeklyEventEconomicsInput = {
  id: string;
  title: string;
  sportId: string;
  seriesId: string | null;
  startTime: Date | null;
  status: string;
  actualCostUsd: number | null;
  economicsSnapshot: WeeklyEconomicsSnapshot | null;
};

export type WeeklyEventEconomicsRow = {
  eventId: string;
  title: string;
  sportId: string;
  seriesId: string | null;
  startIso: string | null;
  status: string;
  tokensLegacy: number;
  tokensPurchased: number;
  tokensFree: number;
  tokensNet: number;
  valueLegacyUsd: number;
  valuePurchasedUsd: number;
  valueFreeUsd: number;
  valueUsd: number;
  actualCostUsd: number | null;
  profitUsd: number | null;
  hasCost: boolean;
  fromSnapshot: boolean;
};

export function buildWeeklyEventEconomicsRows(
  events: WeeklyEventEconomicsInput[],
  attributed: Map<string, SourceBreakdown>
): WeeklyEventEconomicsRow[] {
  return events.map((ev) => {
    const snap = ev.economicsSnapshot;
    const b = snap ?? attributed.get(ev.id) ?? emptySourceBreakdown();
    const tokensNet = snap ? snap.tokensNet : totalTokens(b);
    const valueUsd = snap ? snap.valueUsd : totalValueUsd(b);
    const cost = ev.actualCostUsd;
    return {
      eventId: ev.id,
      title: ev.title,
      sportId: ev.sportId,
      seriesId: ev.seriesId,
      startIso: ev.startTime ? ev.startTime.toISOString() : null,
      status: ev.status,
      tokensLegacy: b.tokensLegacy,
      tokensPurchased: b.tokensPurchased,
      tokensFree: b.tokensFree,
      tokensNet,
      valueLegacyUsd: b.valueLegacyUsd,
      valuePurchasedUsd: b.valuePurchasedUsd,
      valueFreeUsd: b.valueFreeUsd,
      valueUsd,
      actualCostUsd: cost,
      profitUsd: cost == null ? null : valueUsd - cost,
      hasCost: cost != null,
      fromSnapshot: Boolean(snap),
    };
  });
}

export type WeeklyEconomicsGroupBy = "event" | "week" | "month" | "sport" | "series";

export function groupWeeklyEconomicsRows(
  rows: WeeklyEventEconomicsRow[],
  groupBy: WeeklyEconomicsGroupBy,
  labels: {
    sportLabel: (sportId: string) => string;
    seriesLabel: (seriesId: string) => string;
    weekKey: (iso: string | null) => string;
    monthKey: (iso: string | null) => string;
  }
): Array<{
  key: string;
  label: string;
  tokensNet: number;
  tokensLegacy: number;
  tokensPurchased: number;
  tokensFree: number;
  valueUsd: number;
  actualCostUsd: number;
  costEvents: number;
  missingCost: number;
  profitUsd: number | null;
  eventCount: number;
}> {
  type Agg = {
    key: string;
    label: string;
    tokensNet: number;
    tokensLegacy: number;
    tokensPurchased: number;
    tokensFree: number;
    valueUsd: number;
    actualCostUsd: number;
    costEvents: number;
    missingCost: number;
    eventCount: number;
  };
  const map = new Map<string, Agg>();

  for (const r of rows) {
    let key: string;
    let label: string;
    if (groupBy === "event") {
      key = r.eventId;
      label = r.title || r.eventId;
    } else if (groupBy === "sport") {
      key = r.sportId || "unknown";
      label = labels.sportLabel(key);
    } else if (groupBy === "series") {
      key = r.seriesId || `one:${r.eventId}`;
      label = r.seriesId ? labels.seriesLabel(r.seriesId) : r.title || key;
    } else if (groupBy === "week") {
      key = labels.weekKey(r.startIso);
      label = key;
    } else {
      key = labels.monthKey(r.startIso);
      label = key;
    }
    const a = map.get(key) ?? {
      key,
      label,
      tokensNet: 0,
      tokensLegacy: 0,
      tokensPurchased: 0,
      tokensFree: 0,
      valueUsd: 0,
      actualCostUsd: 0,
      costEvents: 0,
      missingCost: 0,
      eventCount: 0,
    };
    a.tokensNet += r.tokensNet;
    a.tokensLegacy += r.tokensLegacy;
    a.tokensPurchased += r.tokensPurchased;
    a.tokensFree += r.tokensFree;
    a.valueUsd += r.valueUsd;
    a.eventCount += 1;
    if (r.actualCostUsd != null) {
      a.actualCostUsd += r.actualCostUsd;
      a.costEvents += 1;
    } else {
      a.missingCost += 1;
    }
    map.set(key, a);
  }

  return [...map.values()]
    .map((a) => ({
      ...a,
      profitUsd: a.costEvents > 0 ? a.valueUsd - a.actualCostUsd : null,
    }))
    .sort((x, y) => y.valueUsd - x.valueUsd);
}

export function parseActualCostUsd(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "actualCostUsd must be a non-negative number or null" };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}
