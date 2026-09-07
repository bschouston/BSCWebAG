import {
  paidChannelLabel,
  reasonLabel,
  visibleReportSections,
  type TokenReportQuery,
} from "@/lib/token-report-query";
import type { TokenReportResponse } from "@/lib/token-report-build";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function reportDownloadBasename(query: TokenReportQuery): string {
  const from = query.from || "all";
  const to = query.to || "all";
  return `token-report_${from}_${to}`;
}

function filterLines(query: TokenReportQuery, truncated: boolean): string[] {
  return [
    `From,${query.from || "all time"}`,
    `To,${query.to || "all time"}`,
    `Reasons,${query.reasons.length ? query.reasons.join(";") : "all"}`,
    `Direction,${query.type}`,
    `Group by,${query.groupBy}`,
    `Metric,${query.metric}`,
    `Dollar mode,${query.dollarsMode}`,
    `Member,${query.userId || ""}`,
    `Event,${query.eventId || ""}`,
    `Question,${query.q || ""}`,
    `Focus,${query.focus}`,
    `Truncated,${truncated ? "yes" : "no"}`,
  ];
}

type Bucket = TokenReportResponse["byReason"][number];

function bucketCsv(title: string, rows: Bucket[], labelFn?: (key: string, label: string) => string): string[] {
  const out = ["", title, csvRow(["Label", "Credit", "Debit", "Net", "Count", "Members", "Dollars", "Avg $/token"])];
  for (const r of rows) {
    const label = labelFn ? labelFn(r.key, r.label) : r.label;
    out.push(
      csvRow([
        label,
        r.tokensCredit,
        r.tokensDebit,
        r.net,
        r.count,
        r.uniqueMembers,
        r.dollars,
        r.avgDollarsPerToken ?? "",
      ])
    );
  }
  return out;
}

export function tokenReportToCsv(report: TokenReportResponse): string {
  const q = report.parsedQuery;
  const s = report.supply;
  const sections = visibleReportSections(q);
  const lines: string[] = ["Token report", ...filterLines(q, report.truncated), "", "KPIs", csvRow(["Metric", "Value"])];
  if (sections.has("kpiCirculation")) {
    lines.push(
      csvRow(["Circulation tokens", report.circulation.totalTokens]),
      csvRow(["Members with balance", report.circulation.membersWithBalance]),
      csvRow(["Member count", report.circulation.memberCount])
    );
  }
  if (sections.has("kpiMinted")) {
    lines.push(
      csvRow(["Minted total (admin + legacy, no Stripe)", s.mintedTotal ?? s.mintedAdmin]),
      csvRow(["Minted (admin add, no Stripe)", s.mintedAdmin]),
      csvRow(["Minted (legacy import, no Stripe)", s.mintedLegacy ?? 0])
    );
  }
  if (sections.has("kpiPurchased")) lines.push(csvRow(["Purchased (paid credits)", s.mintedPaid]));
  if (sections.has("kpiDollars")) {
    lines.push(
      csvRow(["Dollars earned", s.dollarsEarned]),
      csvRow(["Avg $/paid token", s.avgDollarsPerToken ?? ""]),
      csvRow(["Paid credits missing $", s.paidMissingDollars])
    );
  }
  if (sections.has("kpiTransferred")) lines.push(csvRow(["Transferred (change of hands)", s.transferred]));
  if (sections.has("kpiAdminRemove")) lines.push(csvRow(["Admin removed", s.adminRemoved]));
  if (sections.has("kpiRequests")) lines.push(csvRow(["Requests collected", s.requestCollected]));
  if (sections.has("kpiEventNet")) lines.push(csvRow(["Event net used", s.eventNet]));

  if (sections.has("admin")) {
    lines.push(
      "",
      "Admin",
      csvRow(["Add tokens", report.admin.addTokens]),
      csvRow(["Add count", report.admin.addCount]),
      csvRow(["Add members", report.admin.addMembers]),
      csvRow(["Remove tokens", report.admin.removeTokens]),
      csvRow(["Remove count", report.admin.removeCount]),
      csvRow(["Remove members", report.admin.removeMembers])
    );
  }
  if (sections.has("requests")) {
    lines.push(
      "",
      "Token requests",
      csvRow(["Ledger tokens", report.requests.ledgerTokens]),
      csvRow(["Ledger count", report.requests.ledgerCount]),
      csvRow(["Pending count", report.requests.pendingCount]),
      csvRow(["Pending tokens", report.requests.pendingTokens]),
      csvRow(["Paid records in range", report.requests.paidInPeriodCount]),
      csvRow(["Cancelled records in range", report.requests.cancelledInPeriodCount])
    );
  }
  if (sections.has("transfers")) {
    lines.push(
      "",
      "Transfers",
      csvRow(["Tokens", report.transfers.tokensChangingHands]),
      csvRow(["Count", report.transfers.count]),
      csvRow(["Senders", report.transfers.uniqueSenders]),
      csvRow(["Receivers", report.transfers.uniqueReceivers]),
      csvRow(["From", "To", "Tokens", "Count"]),
      ...report.transfers.topPairs.map((p) => csvRow([p.fromName, p.toName, p.tokens, p.count]))
    );
  }
  if (sections.has("unit") || sections.has("paidMix")) {
    lines.push(
      "",
      "Unit buys",
      csvRow(["Charges", report.unitBuys.count]),
      csvRow(["Tokens", report.unitBuys.tokens]),
      csvRow(["Dollars", report.unitBuys.dollars]),
      csvRow(["Members", report.unitBuys.uniqueMembers]),
      csvRow(["Avg $/token", report.unitBuys.avgDollarsPerToken ?? ""])
    );
  }
  if (sections.has("byReason")) {
    lines.push(...bucketCsv("By reason", report.byReason, (key, label) => reasonLabel(key) || label));
  }
  if (sections.has("paidMix")) {
    lines.push(...bucketCsv("Paid channels", report.channels, (key, label) => paidChannelLabel(key) || label));
    lines.push(...bucketCsv("Packages", report.packages));
  } else if (sections.has("packages")) {
    lines.push(...bucketCsv("Packages", report.packages));
  }
  if (sections.has("events")) lines.push(...bucketCsv("Events", report.events));
  if (sections.has("grouped")) lines.push(...bucketCsv(`Grouped (${q.groupBy})`, report.groups));
  if (sections.has("topBalances")) {
    lines.push(
      "",
      "Top balances (current)",
      csvRow(["Name", "Email", "User id", "Balance"]),
      ...report.circulation.topHolders.map((h) => csvRow([h.name, h.email, h.userId, h.balance]))
    );
  }
  if (sections.has("ledger")) {
    lines.push(
      "",
      "Ledger sample",
      csvRow(["When", "Member", "Email", "Reason", "Type", "Tokens", "Dollars", "Event"]),
      ...report.rows.map((r) =>
        csvRow([
          r.createdAt,
          r.name,
          r.email,
          reasonLabel(r.reason),
          r.type,
          r.amount,
          r.dollars ?? "",
          r.eventLabel ?? "",
        ])
      )
    );
  }
  return lines.join("\r\n");
}
