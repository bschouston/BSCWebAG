import { addChicagoDateKeyDays, chicagoDateKey, chicagoWallToUtc } from "@/lib/chicago-time";

export const PAID_REASONS = [
  "purchase",
  "package_purchase",
  "unit_purchase",
  "auto_replenish",
] as const;

export const EVENT_REASONS = [
  "rsvp_hold",
  "rsvp_settle_refund",
  "rsvp_cancel_refund",
  "rsvp",
] as const;

export const REASON_LABELS: Record<string, string> = {
  purchase: "Wallet package",
  auto_replenish: "Auto replenish",
  unit_purchase: "Unit purchase (1-token price)",
  package_purchase: "RSVP / request package",
  rsvp_hold: "RSVP hold",
  rsvp_settle_refund: "RSVP settle refund",
  rsvp_cancel_refund: "RSVP cancel refund",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  admin_adjust: "Admin add / remove",
  token_request: "Token request (paid)",
  legacy_import: "Legacy import (no Stripe)",
  rsvp: "RSVP (legacy)",
};

export type TokenReportGroupBy =
  | "none"
  | "event"
  | "member"
  | "reason"
  | "package"
  | "channel"
  | "day"
  | "week"
  | "month";

export type TokenReportDollarsMode = "live" | "sandbox" | "all";

export type TokenReportFocus =
  | "overview"
  | "circulation"
  | "reason"
  | "paid"
  | "packages"
  | "unit"
  | "admin"
  | "requests"
  | "transfers"
  | "events"
  | "dollars";

export type ReportSection =
  | "kpiCirculation"
  | "kpiMinted"
  | "kpiPurchased"
  | "kpiDollars"
  | "kpiTransferred"
  | "kpiAdminRemove"
  | "kpiRequests"
  | "kpiEventNet"
  | "byReason"
  | "paidMix"
  | "packages"
  | "unit"
  | "admin"
  | "requests"
  | "transfers"
  | "events"
  | "grouped"
  | "topBalances"
  | "ledger";

export type TokenReportQuery = {
  from: string | null;
  to: string | null;
  reasons: string[];
  type: "all" | "CREDIT" | "DEBIT";
  userId: string | null;
  eventId: string | null;
  groupBy: TokenReportGroupBy;
  metric: "tokens" | "dollars";
  dollarsMode: TokenReportDollarsMode;
  q: string;
  focus: TokenReportFocus;
};

export type TokenReportPreset = {
  id: string;
  label: string;
  patch: Partial<TokenReportQuery>;
};

export function defaultReportRange(now = new Date()): { from: string; to: string } {
  const to = chicagoDateKey(now);
  return { from: addChicagoDateKeyDays(to, -89), to };
}

export function emptyTokenReportQuery(now = new Date()): TokenReportQuery {
  const range = defaultReportRange(now);
  return {
    from: range.from,
    to: range.to,
    reasons: [],
    type: "all",
    userId: null,
    eventId: null,
    groupBy: "none",
    metric: "tokens",
    dollarsMode: "live",
    q: "",
    focus: "overview",
  };
}

export const TOKEN_REPORT_PRESETS: TokenReportPreset[] = [
  { id: "circulation", label: "Circulation", patch: { groupBy: "none", reasons: [], metric: "tokens" } },
  { id: "reason", label: "By reason", patch: { groupBy: "reason", reasons: [], metric: "tokens" } },
  {
    id: "paid",
    label: "Paid mix",
    patch: { groupBy: "channel", reasons: [...PAID_REASONS], metric: "tokens" },
  },
  {
    id: "packages",
    label: "Packages",
    patch: {
      groupBy: "package",
      reasons: ["purchase", "package_purchase", "auto_replenish"],
      metric: "tokens",
    },
  },
  {
    id: "unit",
    label: "Unit (1-token) buys",
    patch: { groupBy: "none", reasons: ["unit_purchase"], metric: "tokens" },
  },
  {
    id: "admin",
    label: "Admin add / remove",
    patch: { groupBy: "none", reasons: ["admin_adjust"], metric: "tokens" },
  },
  {
    id: "requests",
    label: "Token requests",
    patch: { groupBy: "none", reasons: ["token_request"], metric: "tokens" },
  },
  {
    id: "transfers",
    label: "Transfers",
    patch: { groupBy: "member", reasons: ["transfer_out", "transfer_in"], metric: "tokens" },
  },
  {
    id: "events",
    label: "Events used most",
    patch: { groupBy: "event", reasons: [...EVENT_REASONS], metric: "tokens" },
  },
  {
    id: "dollars",
    label: "Dollars / avg $/token",
    patch: { groupBy: "month", reasons: [...PAID_REASONS], metric: "dollars" },
  },
];

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";
  return REASON_LABELS[reason] ?? reason;
}

export function paidChannel(reason: string): string | null {
  if (reason === "purchase") return "wallet_package";
  if (reason === "package_purchase") return "rsvp_package";
  if (reason === "auto_replenish") return "auto_replenish";
  if (reason === "unit_purchase") return "unit";
  return null;
}

export function paidChannelLabel(channel: string): string {
  if (channel === "wallet_package") return "Wallet packages";
  if (channel === "rsvp_package") return "RSVP / request packages";
  if (channel === "auto_replenish") return "Auto replenish";
  if (channel === "unit") return "Unit (1-token price)";
  return channel;
}

export function eventIdFromTxRow(row: { eventId?: unknown; meta?: unknown }): string {
  if (typeof row.eventId === "string" && row.eventId.trim()) return row.eventId.trim();
  const meta = row.meta;
  if (meta && typeof meta === "object" && "eventId" in meta) {
    const nested = (meta as { eventId?: unknown }).eventId;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return "";
}

export function packageIdFromMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const id = (meta as { packageId?: unknown }).packageId;
  return typeof id === "string" && id.trim() ? id.trim() : "";
}

export function packageLabelFromMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const label = (meta as { packageLabel?: unknown }).packageLabel;
  return typeof label === "string" && label.trim() ? label.trim() : "";
}

export function dollarsFromLedgerRow(data: Record<string, unknown>): number | null {
  const refunded =
    data.stripeChargeStatus === "refunded" ||
    (typeof data.stripeRefundId === "string" && data.stripeRefundId.length > 0);
  if (refunded) return 0;

  if (typeof data.stripeAmountPaid === "number" && Number.isFinite(data.stripeAmountPaid)) {
    return data.stripeAmountPaid;
  }
  const meta = data.meta;
  if (meta && typeof meta === "object") {
    const total = (meta as { amountTotal?: unknown }).amountTotal;
    if (typeof total === "number" && Number.isFinite(total) && total > 0) {
      return total / 100;
    }
    const cents = (meta as { amountCents?: unknown }).amountCents;
    if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) {
      return cents / 100;
    }
  }
  return null;
}

function chicagoYearMonth(ymd: string): string {
  return ymd.slice(0, 7);
}

function lastDayOfMonth(ym: string): string {
  const [yRaw, mRaw] = ym.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const next =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addChicagoDateKeyDays(next, -1);
}

/** Monday YYYY-MM-DD (Chicago) for the week containing `ymd`. */
export function chicagoWeekStart(ymd: string): string {
  const noon = chicagoWallToUtc(`${ymd}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = map[weekday] ?? 1;
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addChicagoDateKeyDays(ymd, mondayOffset);
}

export function applyPreset(
  current: TokenReportQuery,
  preset: TokenReportPreset
): TokenReportQuery {
  return { ...current, ...preset.patch, q: "", focus: preset.id as TokenReportFocus };
}

const FOCUS_IDS: TokenReportFocus[] = [
  "overview",
  "circulation",
  "reason",
  "paid",
  "packages",
  "unit",
  "admin",
  "requests",
  "transfers",
  "events",
  "dollars",
];

function sameReasons(a: string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export function focusFromFilters(query: TokenReportQuery): TokenReportFocus {
  const r = query.reasons;
  if (r.length === 1 && r[0] === "unit_purchase") return "unit";
  if (r.length === 1 && r[0] === "admin_adjust") return "admin";
  if (r.length === 1 && r[0] === "token_request") return "requests";
  if (
    r.length === 2 &&
    r.includes("transfer_out") &&
    r.includes("transfer_in")
  ) {
    return "transfers";
  }
  if (query.groupBy === "event" || (r.length > 0 && r.every((x) => (EVENT_REASONS as readonly string[]).includes(x)))) {
    return "events";
  }
  const pkgReasons = ["purchase", "package_purchase", "auto_replenish"];
  if (query.groupBy === "package" || sameReasons(r, pkgReasons)) return "packages";
  if (sameReasons(r, PAID_REASONS) && (query.metric === "dollars" || query.groupBy === "month")) {
    return "dollars";
  }
  if (sameReasons(r, PAID_REASONS) && query.groupBy === "channel") return "paid";
  if (query.groupBy === "reason" && r.length === 0) return "reason";
  if (r.length === 0 && query.groupBy === "none" && query.metric === "tokens") return "overview";
  if (sameReasons(r, PAID_REASONS)) return "paid";
  return "overview";
}

export function visibleReportSections(query: TokenReportQuery): Set<ReportSection> {
  const grouped = query.groupBy !== "none";
  const ledger: ReportSection[] = ["ledger"];
  switch (query.focus) {
    case "circulation":
      return new Set(["kpiCirculation", "topBalances", ...ledger]);
    case "reason":
      return new Set(["byReason", ...(grouped ? (["grouped"] as ReportSection[]) : []), ...ledger]);
    case "paid":
      return new Set(["kpiPurchased", "kpiDollars", "paidMix", ...ledger]);
    case "packages":
      return new Set(["kpiPurchased", "packages", ...ledger]);
    case "unit":
      return new Set(["kpiPurchased", "unit", ...ledger]);
    case "admin":
      return new Set(["kpiMinted", "kpiAdminRemove", "admin", ...ledger]);
    case "requests":
      return new Set(["kpiRequests", "requests", ...ledger]);
    case "transfers":
      return new Set(["kpiTransferred", "transfers", ...ledger]);
    case "events":
      return new Set(["kpiEventNet", "events", ...ledger]);
    case "dollars":
      return new Set(["kpiDollars", "paidMix", "grouped", ...ledger]);
    default: {
      const all: ReportSection[] = [
        "kpiCirculation",
        "kpiMinted",
        "kpiPurchased",
        "kpiDollars",
        "kpiTransferred",
        "kpiAdminRemove",
        "kpiRequests",
        "kpiEventNet",
        "byReason",
        "paidMix",
        "admin",
        "requests",
        "transfers",
        "events",
        "topBalances",
        "ledger",
      ];
      if (grouped) all.push("grouped");
      return new Set(all);
    }
  }
}

export function parseTokenReportQuestion(
  raw: string,
  now = new Date()
): Partial<TokenReportQuery> {
  const q = raw.trim().toLowerCase();
  if (!q) return {};
  const today = chicagoDateKey(now);
  const ym = chicagoYearMonth(today);
  const patch: Partial<TokenReportQuery> = { q: raw.trim() };

  if (/\ball time\b|\bever\b/.test(q)) {
    patch.from = null;
    patch.to = null;
  } else if (/\bthis month\b/.test(q)) {
    patch.from = `${ym}-01`;
    patch.to = today;
  } else if (/\blast month\b/.test(q)) {
    const [yRaw, mRaw] = ym.split("-");
    const y = Number(yRaw);
    const m = Number(mRaw);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    patch.from = `${prev}-01`;
    patch.to = lastDayOfMonth(prev);
  } else if (/\bthis week\b/.test(q)) {
    patch.from = chicagoWeekStart(today);
    patch.to = today;
  } else if (/\blast week\b/.test(q)) {
    const thisMon = chicagoWeekStart(today);
    const lastMon = addChicagoDateKeyDays(thisMon, -7);
    patch.from = lastMon;
    patch.to = addChicagoDateKeyDays(thisMon, -1);
  } else if (/\blast 90\b|\bpast 90\b/.test(q)) {
    const range = defaultReportRange(now);
    patch.from = range.from;
    patch.to = range.to;
  }

  if (/\btransfer|\bchanging hands|\bsent to\b/.test(q)) {
    patch.reasons = ["transfer_out", "transfer_in"];
    patch.groupBy = "member";
    patch.metric = "tokens";
    patch.focus = "transfers";
  } else if (/\brequest\b/.test(q)) {
    patch.reasons = ["token_request"];
    patch.groupBy = "none";
    patch.metric = "tokens";
    patch.focus = "requests";
  } else if (/\badmin\b|\bmint\b|\badd\/remove\b|\badded\b|\bremoved\b/.test(q)) {
    patch.reasons = ["admin_adjust"];
    patch.groupBy = "none";
    patch.metric = "tokens";
    patch.focus = "admin";
  } else if (/\bunit\b|\b1-token\b|\bone.token\b|\ba la carte\b/.test(q)) {
    patch.reasons = ["unit_purchase"];
    patch.groupBy = "none";
    patch.metric = "tokens";
    patch.focus = "unit";
  } else if (/\bpackage\b/.test(q)) {
    patch.reasons = ["purchase", "package_purchase", "auto_replenish"];
    patch.groupBy = "package";
    patch.metric = "tokens";
    patch.focus = "packages";
  } else if (/\bevent\b|\bused the most\b|\bholds?\b/.test(q)) {
    patch.reasons = [...EVENT_REASONS];
    patch.groupBy = "event";
    patch.metric = "tokens";
    patch.focus = "events";
  } else if (/\bdollar|\brevenue|\bearn|\b\$\b|\bprice\b/.test(q)) {
    patch.reasons = [...PAID_REASONS];
    patch.groupBy = "month";
    patch.metric = "dollars";
    patch.focus = "dollars";
  } else if (/\bpurchas|\bbought\b|\bsold\b/.test(q)) {
    patch.reasons = [...PAID_REASONS];
    patch.groupBy = "month";
    patch.metric = "tokens";
    patch.focus = "paid";
  } else if (/\bbalance|\bcirculation|\bsitting\b|\bin wallets?\b/.test(q)) {
    patch.reasons = [];
    patch.groupBy = "none";
    patch.metric = "tokens";
    patch.focus = "circulation";
  }

  return patch;
}

export function queryToSearchParams(query: TokenReportQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (!query.from && !query.to) params.set("allTime", "1");
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.reasons.length) params.set("reasons", query.reasons.join(","));
  if (query.type !== "all") params.set("type", query.type);
  if (query.userId) params.set("userId", query.userId);
  if (query.eventId) params.set("eventId", query.eventId);
  if (query.groupBy !== "none") params.set("groupBy", query.groupBy);
  if (query.metric !== "tokens") params.set("metric", query.metric);
  if (query.dollarsMode !== "live") params.set("dollarsMode", query.dollarsMode);
  if (query.q) params.set("q", query.q);
  if (query.focus !== "overview") params.set("focus", query.focus);
  return params;
}

export function queryFromSearchParams(searchParams: URLSearchParams, now = new Date()): TokenReportQuery {
  const base = emptyTokenReportQuery(now);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const allTime = searchParams.get("allTime") === "1";
  const reasonsRaw = searchParams.get("reasons");
  const type = searchParams.get("type");
  const groupBy = searchParams.get("groupBy");
  const metric = searchParams.get("metric");
  const dollarsMode = searchParams.get("dollarsMode");
  const groupByOk: TokenReportGroupBy[] = [
    "none",
    "event",
    "member",
    "reason",
    "package",
    "channel",
    "day",
    "week",
    "month",
  ];
  return {
    from: allTime ? null : from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : base.from,
    to: allTime ? null : to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : base.to,
    reasons: reasonsRaw
      ? reasonsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    type: type === "CREDIT" || type === "DEBIT" ? type : "all",
    userId: searchParams.get("userId") || null,
    eventId: searchParams.get("eventId") || null,
    groupBy: groupByOk.includes(groupBy as TokenReportGroupBy)
      ? (groupBy as TokenReportGroupBy)
      : "none",
    metric: metric === "dollars" ? "dollars" : "tokens",
    dollarsMode:
      dollarsMode === "sandbox" || dollarsMode === "all" || dollarsMode === "live"
        ? dollarsMode
        : "live",
    q: searchParams.get("q") ?? "",
    focus: FOCUS_IDS.includes(searchParams.get("focus") as TokenReportFocus)
      ? (searchParams.get("focus") as TokenReportFocus)
      : "overview",
  };
}
