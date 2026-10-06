import { chicagoDateKey } from "@/lib/chicago-time";
import {
  LEGACY_TOKEN_USD,
  attributeEventTokenUsage,
  buildWeeklyEventEconomicsRows,
  economicsTxFromRaw,
  groupWeeklyEconomicsRows,
  parseEconomicsSnapshot,
  totalValueUsd,
  type WeeklyEconomicsGroupBy,
  type WeeklyEventEconomicsInput,
  type WeeklyEventEconomicsRow,
} from "@/lib/token-economics";
import { chicagoWeekStart, type TokenReportGroupBy } from "@/lib/token-report-query";

export type WeeklyEconomicsReport = {
  legacyTokenUsd: number;
  totals: {
    tokensNet: number;
    tokensLegacy: number;
    tokensPurchased: number;
    tokensFree: number;
    valueUsd: number;
    valueLegacyUsd: number;
    valuePurchasedUsd: number;
    valueFreeUsd: number;
    actualCostUsd: number;
    profitUsd: number | null;
    eventsWithCost: number;
    eventsMissingCost: number;
    eventsFromSnapshot: number;
    eventCount: number;
  };
  supplyHint: {
    legacyMintedTokens: number;
    legacyValuedUsd: number;
    purchasedMintedTokens: number;
    purchasedMintedUsd: number;
    freeMintedTokens: number;
  };
  rows: WeeklyEventEconomicsRow[];
  groups: ReturnType<typeof groupWeeklyEconomicsRows>;
  groupBy: WeeklyEconomicsGroupBy;
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

export function weeklyEventFromDoc(
  id: string,
  data: Record<string, unknown>
): WeeklyEventEconomicsInput | null {
  if (data.category !== "WEEKLY_SPORTS") return null;
  const cost =
    typeof data.actualCostUsd === "number" && Number.isFinite(data.actualCostUsd)
      ? data.actualCostUsd
      : null;
  return {
    id,
    title: typeof data.title === "string" ? data.title : id,
    sportId: typeof data.sportId === "string" ? data.sportId : "",
    seriesId: typeof data.seriesId === "string" && data.seriesId ? data.seriesId : null,
    startTime: toDate(data.startTime),
    status: typeof data.status === "string" ? data.status : "",
    actualCostUsd: cost,
    economicsSnapshot: parseEconomicsSnapshot(data.economicsSnapshot),
  };
}

function resolveGroupBy(groupBy: TokenReportGroupBy): WeeklyEconomicsGroupBy {
  if (groupBy === "week" || groupBy === "month" || groupBy === "sport" || groupBy === "series") {
    return groupBy;
  }
  return "event";
}

export function buildWeeklyEconomicsReport(opts: {
  events: WeeklyEventEconomicsInput[];
  ledgerRaw: Array<{ id: string; data: Record<string, unknown> }>;
  groupBy: TokenReportGroupBy;
  sportLabels: Map<string, string>;
  seriesLabels: Map<string, string>;
}): WeeklyEconomicsReport {
  const economicsTxs = opts.ledgerRaw.map((r) => economicsTxFromRaw(r.id, r.data));
  const attributed = attributeEventTokenUsage(economicsTxs);
  // Only finalized weeks: DRAFT / PUBLISHED / CANCELLED (etc.) must not affect cost or P&L.
  const completedEvents = opts.events.filter((e) => e.status === "COMPLETED");
  const rows = buildWeeklyEventEconomicsRows(completedEvents, attributed.byEvent).sort((a, b) => {
    const ta = a.startIso ? new Date(a.startIso).getTime() : 0;
    const tb = b.startIso ? new Date(b.startIso).getTime() : 0;
    return tb - ta;
  });

  const groupBy = resolveGroupBy(opts.groupBy);
  const groups = groupWeeklyEconomicsRows(rows, groupBy, {
    sportLabel: (id) => opts.sportLabels.get(id) || id || "Unknown sport",
    seriesLabel: (id) => opts.seriesLabels.get(id) || id || "Unknown series",
    weekKey: (iso) => {
      if (!iso) return "unknown";
      return chicagoWeekStart(chicagoDateKey(new Date(iso)));
    },
    monthKey: (iso) => {
      if (!iso) return "unknown";
      return chicagoDateKey(new Date(iso)).slice(0, 7);
    },
  });

  let tokensNet = 0;
  let tokensLegacy = 0;
  let tokensPurchased = 0;
  let tokensFree = 0;
  let valueUsd = 0;
  let valueLegacyUsd = 0;
  let valuePurchasedUsd = 0;
  let valueFreeUsd = 0;
  let actualCostUsd = 0;
  let eventsWithCost = 0;
  let eventsMissingCost = 0;
  let eventsFromSnapshot = 0;

  for (const r of rows) {
    tokensNet += r.tokensNet;
    tokensLegacy += r.tokensLegacy;
    tokensPurchased += r.tokensPurchased;
    tokensFree += r.tokensFree;
    valueUsd += r.valueUsd;
    valueLegacyUsd += r.valueLegacyUsd;
    valuePurchasedUsd += r.valuePurchasedUsd;
    valueFreeUsd += r.valueFreeUsd;
    if (r.actualCostUsd != null) {
      actualCostUsd += r.actualCostUsd;
      eventsWithCost += 1;
    } else {
      eventsMissingCost += 1;
    }
    if (r.fromSnapshot) eventsFromSnapshot += 1;
  }

  return {
    legacyTokenUsd: LEGACY_TOKEN_USD,
    totals: {
      tokensNet,
      tokensLegacy,
      tokensPurchased,
      tokensFree,
      valueUsd,
      valueLegacyUsd,
      valuePurchasedUsd,
      valueFreeUsd,
      actualCostUsd,
      profitUsd: eventsWithCost > 0 ? valueUsd - actualCostUsd : null,
      eventsWithCost,
      eventsMissingCost,
      eventsFromSnapshot,
      eventCount: rows.length,
    },
    supplyHint: {
      legacyMintedTokens: attributed.legacyMintedTokens,
      legacyValuedUsd: attributed.legacyMintedTokens * LEGACY_TOKEN_USD,
      purchasedMintedTokens: attributed.purchasedMintedTokens,
      purchasedMintedUsd: attributed.purchasedMintedUsd,
      freeMintedTokens: attributed.freeMintedTokens,
    },
    rows,
    groups,
    groupBy,
  };
}

/** Re-export helper used by CSV. */
export { totalValueUsd };
