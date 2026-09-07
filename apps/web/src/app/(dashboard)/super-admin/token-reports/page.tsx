"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeInputs } from "@/components/admin/date-range-inputs";
import { Download, Loader2, RefreshCw } from "lucide-react";
import type { TokenReportResponse } from "@/lib/token-report-build";
import { reportDownloadBasename } from "@/lib/token-report-export";
import { downloadElementAsPdf } from "@/lib/token-report-pdf";
import {
  REASON_LABELS,
  TOKEN_REPORT_PRESETS,
  applyPreset,
  emptyTokenReportQuery,
  focusFromFilters,
  paidChannelLabel,
  parseTokenReportQuestion,
  queryToSearchParams,
  reasonLabel,
  visibleReportSections,
  type TokenReportGroupBy,
  type TokenReportQuery,
} from "@/lib/token-report-query";

function fmtUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtN(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

type BucketRow = TokenReportResponse["byReason"][number];

function BucketTable({
  rows,
  keyHeader,
}: {
  rows: BucketRow[];
  keyHeader: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No rows in this period.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyHeader}</TableHead>
          <TableHead className="text-right">Credit</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Count</TableHead>
          <TableHead className="text-right">Members</TableHead>
          <TableHead className="text-right">Dollars</TableHead>
          <TableHead className="text-right">Avg $/token</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium text-foreground">{r.label}</TableCell>
            <TableCell className="text-right">{fmtN(r.tokensCredit)}</TableCell>
            <TableCell className="text-right">{fmtN(r.tokensDebit)}</TableCell>
            <TableCell className="text-right">{fmtN(r.net)}</TableCell>
            <TableCell className="text-right">{fmtN(r.count)}</TableCell>
            <TableCell className="text-right">{fmtN(r.uniqueMembers)}</TableCell>
            <TableCell className="text-right">{fmtUsd(r.dollars)}</TableCell>
            <TableCell className="text-right">{fmtUsd(r.avgDollarsPerToken)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function TokenReportsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState<TokenReportQuery>(() => emptyTokenReportQuery());
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState<TokenReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportViewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (next: TokenReportQuery) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const params = queryToSearchParams(next);
        const res = await fetch(`/api/super-admin/token-reports?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load report");
        setReport(data as TokenReportResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const downloadReport = async (format: "csv" | "pdf") => {
    if (!user) return;
    setDownloading(format);
    setError(null);
    try {
      if (format === "pdf") {
        await load(query);
        await new Promise((r) => setTimeout(r, 400));
        const el = reportViewRef.current;
        if (!el) throw new Error("Run the report first, then download PDF.");
        await downloadElementAsPdf(el, `${reportDownloadBasename(query)}.pdf`);
        return;
      }
      const token = await user.getIdToken();
      const params = queryToSearchParams(query);
      params.set("format", "csv");
      const res = await fetch(`/api/super-admin/token-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Download failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const name = match?.[1] ?? "token-report.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    void load(query);
    // initial + when user ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const run = (next: TokenReportQuery) => {
    setQuery(next);
    void load(next);
  };

  const reasonFilter = query.reasons.length === 1 ? query.reasons[0] : query.reasons.length ? "multi" : "all";
  const sections = visibleReportSections(query);
  const showKpis =
    sections.has("kpiCirculation") ||
    sections.has("kpiMinted") ||
    sections.has("kpiPurchased") ||
    sections.has("kpiDollars") ||
    sections.has("kpiTransferred") ||
    sections.has("kpiAdminRemove") ||
    sections.has("kpiRequests") ||
    sections.has("kpiEventNet");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Token reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only analysis of wallets, the full token ledger, packages, unit buys, admin mint/remove,
          requests, transfers, and event holds. For Stripe refunds use{" "}
          <Link href="/super-admin/token-transactions" className="underline">
            Token Transactions
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Query</CardTitle>
          <CardDescription>
            Presets and filters map into the same report. Circulation is always current wallet balances.
            Ledger figures follow the date range. CSV downloads the data; PDF captures this report view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TOKEN_REPORT_PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={query.focus === p.id ? "secondary" : "outline"}
                size="sm"
                className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
                onClick={() => run(applyPreset(query, p))}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. which events used the most tokens last month"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  run({ ...query, ...parseTokenReportQuestion(question), q: question });
                }
              }}
            />
            <Button
              type="button"
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
              onClick={() => run({ ...query, ...parseTokenReportQuestion(question), q: question })}
            >
              Apply question
            </Button>
          </div>
          <DateRangeInputs
            from={query.from ?? ""}
            to={query.to ?? ""}
            onFromChange={(from) => setQuery((q) => ({ ...q, from: from || null }))}
            onToChange={(to) => setQuery((q) => ({ ...q, to: to || null }))}
            showTimezone={false}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Select
                value={reasonFilter}
                onValueChange={(v) =>
                  setQuery((q) => {
                    const next: TokenReportQuery = {
                      ...q,
                      reasons: v === "all" || v === "multi" ? (v === "all" ? [] : q.reasons) : [v],
                    };
                    next.focus = focusFromFilters(next);
                    return next;
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {reasonFilter === "multi" ? (
                    <SelectItem value="multi">Multiple (from preset)</SelectItem>
                  ) : null}
                  {Object.keys(REASON_LABELS).map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <Select
                value={query.type}
                onValueChange={(v) =>
                  setQuery((q) => ({ ...q, type: v as TokenReportQuery["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Credit and debit</SelectItem>
                  <SelectItem value="CREDIT">Credit</SelectItem>
                  <SelectItem value="DEBIT">Debit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Group by</Label>
              <Select
                value={query.groupBy}
                onValueChange={(v) =>
                  setQuery((q) => {
                    const next = { ...q, groupBy: v as TokenReportGroupBy };
                    next.focus = focusFromFilters(next);
                    return next;
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="reason">Reason</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="package">Package</SelectItem>
                  <SelectItem value="channel">Paid channel</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dollar mode</Label>
              <Select
                value={query.dollarsMode}
                onValueChange={(v) =>
                  setQuery((q) => ({
                    ...q,
                    dollarsMode: v as TokenReportQuery["dollarsMode"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">Live Stripe only</SelectItem>
                  <SelectItem value="sandbox">Sandbox only</SelectItem>
                  <SelectItem value="all">Live + sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
              onClick={() => run(query)}
            >
              Run report
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = emptyTokenReportQuery();
                setQuestion("");
                run(next);
              }}
            >
              Reset
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => run(query)} aria-label="Refresh">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(downloading) || loading}
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              onClick={() => void downloadReport("csv")}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === "csv" ? "CSV…" : "Download CSV"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(downloading) || loading}
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              onClick={() => void downloadReport("pdf")}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading === "pdf" ? "PDF…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading && !report ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading report…
        </div>
      ) : null}

      {report ? (
        <div ref={reportViewRef} className="space-y-6 rounded-lg bg-background p-1">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Token reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.from || "All time"} – {query.to || "All time"} · {query.focus} · reasons:{" "}
              {query.reasons.length ? query.reasons.join(", ") : "all"} · {query.type} · group{" "}
              {query.groupBy} · dollars {query.dollarsMode}
            </p>
          </div>
          {report.truncated ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Scan cap reached. Narrow the date range — later ledger rows were not included.
            </p>
          ) : null}

          {showKpis ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sections.has("kpiCirculation") ? (
            <Kpi
              label="In circulation"
              value={fmtN(report.circulation.totalTokens)}
              hint={`${fmtN(report.circulation.membersWithBalance)} members with a balance`}
            />
            ) : null}
            {sections.has("kpiMinted") ? (
            <Kpi
              label="Minted"
              value={fmtN(report.supply.mintedTotal ?? report.supply.mintedAdmin)}
              hint={`Admin add ${fmtN(report.supply.mintedAdmin)}${
                typeof report.supply.mintedLegacy === "number" && report.supply.mintedLegacy > 0
                  ? ` · Legacy import ${fmtN(report.supply.mintedLegacy)} (no Stripe)`
                  : " — no Stripe, created out of thin air"
              }`}
            />
            ) : null}
            {sections.has("kpiPurchased") ? (
            <Kpi
              label="Purchased"
              value={fmtN(report.supply.mintedPaid)}
              hint="Wallet / package / unit / auto-replenish credits"
            />
            ) : null}
            {sections.has("kpiDollars") ? (
            <Kpi
              label="Dollars earned"
              value={fmtUsd(report.supply.dollarsEarned)}
              hint={
                report.supply.avgDollarsPerToken != null
                  ? `Avg ${fmtUsd(report.supply.avgDollarsPerToken)} / paid token`
                  : "No paid-dollar rows"
              }
            />
            ) : null}
            {sections.has("kpiTransferred") ? (
            <Kpi
              label="Transferred"
              value={fmtN(report.transfers.tokensChangingHands)}
              hint={`${fmtN(report.transfers.count)} transfers`}
            />
            ) : null}
            {sections.has("kpiAdminRemove") ? (
            <Kpi
              label="Admin remove"
              value={fmtN(report.admin.removeTokens)}
              hint={`${fmtN(report.admin.removeCount)} adjustments`}
            />
            ) : null}
            {sections.has("kpiRequests") ? (
            <Kpi
              label="Requests collected"
              value={fmtN(report.requests.ledgerTokens)}
              hint={`${fmtN(report.requests.pendingCount)} pending · ${fmtN(report.requests.pendingTokens)} tokens`}
            />
            ) : null}
            {sections.has("kpiEventNet") ? (
            <Kpi
              label="Event net used"
              value={fmtN(report.supply.eventNet)}
              hint="Holds minus refunds in range"
            />
            ) : null}
          </div>
          ) : null}

          {sections.has("byReason") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By reason</CardTitle>
            </CardHeader>
            <CardContent>
              <BucketTable
                rows={report.byReason.map((r) => ({ ...r, label: reasonLabel(r.key) }))}
                keyHeader="Reason"
              />
            </CardContent>
          </Card>
          ) : null}

          {sections.has("paidMix") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Paid mix</CardTitle>
              <CardDescription>
                Packages vs unit (1-token) price. Dollars use stored amounts only; missing $ is not guessed.
                {report.supply.paidMissingDollars
                  ? ` ${report.supply.paidMissingDollars} paid credits have no dollar amount.`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BucketTable
                rows={report.channels.map((r) => ({ ...r, label: paidChannelLabel(r.key) }))}
                keyHeader="Channel"
              />
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Packages</p>
              <BucketTable rows={report.packages} keyHeader="Package" />
              <p className="text-sm text-foreground">
                Unit buys: {fmtN(report.unitBuys.count)} charges · {fmtN(report.unitBuys.tokens)} tokens at
                unit price · {fmtUsd(report.unitBuys.dollars)} · {fmtN(report.unitBuys.uniqueMembers)}{" "}
                members
                {report.unitBuys.avgDollarsPerToken != null
                  ? ` · avg ${fmtUsd(report.unitBuys.avgDollarsPerToken)}/token`
                  : ""}
                .
              </p>
            </CardContent>
          </Card>
          ) : null}

          {sections.has("packages") && !sections.has("paidMix") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Packages</CardTitle>
            </CardHeader>
            <CardContent>
              <BucketTable rows={report.packages} keyHeader="Package" />
            </CardContent>
          </Card>
          ) : null}

          {sections.has("unit") && !sections.has("paidMix") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Unit (1-token) buys</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">
                Unit buys: {fmtN(report.unitBuys.count)} charges · {fmtN(report.unitBuys.tokens)} tokens at
                unit price · {fmtUsd(report.unitBuys.dollars)} · {fmtN(report.unitBuys.uniqueMembers)}{" "}
                members
                {report.unitBuys.avgDollarsPerToken != null
                  ? ` · avg ${fmtUsd(report.unitBuys.avgDollarsPerToken)}/token`
                  : ""}
                .
              </p>
            </CardContent>
          </Card>
          ) : null}

          {sections.has("admin") || sections.has("requests") ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {sections.has("admin") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Admin add / remove</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-foreground space-y-1">
                <p>
                  Add / mint (no dollars): {fmtN(report.admin.addTokens)} tokens · {fmtN(report.admin.addCount)} ·{" "}
                  {fmtN(report.admin.addMembers)} members
                </p>
                <p>
                  Remove: {fmtN(report.admin.removeTokens)} tokens · {fmtN(report.admin.removeCount)} ·{" "}
                  {fmtN(report.admin.removeMembers)} members
                </p>
              </CardContent>
            </Card>
            ) : null}
            {sections.has("requests") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Token requests</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-foreground space-y-1">
                <p>
                  Paid (ledger): {fmtN(report.requests.ledgerTokens)} tokens ·{" "}
                  {fmtN(report.requests.ledgerCount)}
                </p>
                <p>
                  Pending now: {fmtN(report.requests.pendingCount)} · {fmtN(report.requests.pendingTokens)}{" "}
                  tokens
                </p>
                <p>
                  Paid in range (records): {fmtN(report.requests.paidInPeriodCount)} · cancelled{" "}
                  {fmtN(report.requests.cancelledInPeriodCount)}
                </p>
              </CardContent>
            </Card>
            ) : null}
          </div>
          ) : null}

          {sections.has("transfers") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Transfers</CardTitle>
              <CardDescription>Counted from transfer-out so tokens are not doubled.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-foreground">
                {fmtN(report.transfers.tokensChangingHands)} tokens · {fmtN(report.transfers.count)}{" "}
                transfers · {fmtN(report.transfers.uniqueSenders)} senders ·{" "}
                {fmtN(report.transfers.uniqueReceivers)} receivers
              </p>
              {report.transfers.topPairs.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.transfers.topPairs.map((p) => (
                      <TableRow key={`${p.fromId}-${p.toId}`}>
                        <TableCell>{p.fromName}</TableCell>
                        <TableCell>{p.toName}</TableCell>
                        <TableCell className="text-right">{fmtN(p.tokens)}</TableCell>
                        <TableCell className="text-right">{fmtN(p.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No transfers in this period.</p>
              )}
            </CardContent>
          </Card>
          ) : null}

          {sections.has("events") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Events</CardTitle>
            </CardHeader>
            <CardContent>
              <BucketTable rows={report.events} keyHeader="Event" />
            </CardContent>
          </Card>
          ) : null}

          {sections.has("grouped") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Grouped ({query.groupBy})</CardTitle>
              </CardHeader>
              <CardContent>
                <BucketTable rows={report.groups} keyHeader="Group" />
              </CardContent>
            </Card>
          ) : null}

          {sections.has("topBalances") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top balances</CardTitle>
              <CardDescription>Current wallets, not historical.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.circulation.topHolders.map((h) => (
                    <TableRow key={h.userId}>
                      <TableCell>
                        <Link className="underline" href={`/admin/members/${h.userId}?tab=wallet`}>
                          {h.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{h.email}</TableCell>
                      <TableCell className="text-right">{fmtN(h.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          ) : null}

          {sections.has("ledger") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ledger sample</CardTitle>
              <CardDescription>Newest matching rows (capped).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Dollars</TableHead>
                    <TableHead>Event</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtWhen(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link className="underline" href={`/admin/members/${r.userId}?tab=wallet`}>
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell>{reasonLabel(r.reason)}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell className="text-right">{fmtN(r.amount)}</TableCell>
                      <TableCell className="text-right">{fmtUsd(r.dollars)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.eventLabel || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
