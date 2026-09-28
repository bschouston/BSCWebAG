"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateRangeInputs } from "@/components/admin/date-range-inputs";
import { Download, Loader2, RefreshCw } from "lucide-react";

type AdminAuditRow = {
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
function isMemberUid(id: string): boolean {
  if (!id) return false;
  if (id === "stripe_webhook") return false;
  if (id.includes(":")) return false;
  return id.length >= 10;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function metaSummary(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta);
  if (keys.length === 0) return "—";
  const prefer = ["itsNumber", "amount", "role", "eventId", "note", "mode", "direction"];
  const parts: string[] = [];
  for (const k of prefer) {
    if (meta[k] == null || meta[k] === "") continue;
    parts.push(`${k}=${String(meta[k])}`);
    if (parts.length >= 3) break;
  }
  if (parts.length === 0) {
    return keys.slice(0, 3).map((k) => `${k}=${String(meta[k])}`).join(", ");
  }
  return parts.join(", ");
}

export default function SuperAdminAuditLogPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [metaRow, setMetaRow] = useState<AdminAuditRow | null>(null);
  const didLoad = useRef(false);

  const buildParams = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (cursor) params.set("cursor", cursor);
      params.set("pageSize", "50");
      return params;
    },
    [actionFilter, dateFrom, dateTo]
  );

  const fetchPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      const token = await user?.getIdToken();
      const params = buildParams(cursor);
      const res = await fetch(`/api/super-admin/admin-audit?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit log");
      const nextRows = (data.rows ?? []) as AdminAuditRow[];
      setRows((prev) => (replace ? nextRows : [...prev, ...nextRows]));
      setNextCursor(data.nextCursor ?? null);
      if (data.actionLabels && typeof data.actionLabels === "object") {
        setActionLabels(data.actionLabels as Record<string, string>);
      }
    },
    [user, buildParams]
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        await fetchPage(null, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    if (!user) return;
    void load(didLoad.current);
    didLoad.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, actionFilter, dateFrom, dateTo]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(nextCursor, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = buildParams(null);
      params.delete("pageSize");
      params.set("format", "csv");
      const res = await fetch(`/api/super-admin/admin-audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const name = match?.[1] ?? "admin-audit.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      if (res.headers.get("X-Export-Truncated") === "1") {
        setError("CSV export hit the 5,000-row cap and was truncated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const actionOptions = useMemo(() => {
    const entries = Object.entries(actionLabels).sort((a, b) => a[1].localeCompare(b[1]));
    return entries;
  }, [actionLabels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.action,
        r.actionLabel,
        r.adminUid,
        r.adminName,
        r.adminEmail,
        r.targetUid,
        r.targetName,
        r.targetEmail,
        JSON.stringify(r.meta),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Super Admin–only ledger of audited admin and system actions (name overrides, ITS#, tokens,
            billing, weekly events, and more).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button size="sm" onClick={() => void handleExport()} disabled={exporting || loading}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
          <CardDescription>
            CSV export uses action and date filters (not free-text search). Dates are Chicago calendar
            days.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[16rem] h-8">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRangeInputs
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
          <div className="space-y-1 min-w-[12rem] flex-1">
            <Label htmlFor="audit-search" className="text-xs text-muted-foreground">
              Search (this page)
            </Label>
            <Input
              id="audit-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, UID, action…"
              className="h-8"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading audit log…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No audit entries found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatWhen(row.at)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-foreground">{row.actionLabel}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.action}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{row.adminName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.adminEmail || row.adminUid}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {isMemberUid(row.targetUid) ? (
                          <Link
                            href={`/admin/members/${row.targetUid}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.targetName}
                          </Link>
                        ) : (
                          <div>{row.targetName}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {row.targetEmail || row.targetUid}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[18rem]">
                        <button
                          type="button"
                          className="text-left text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                          onClick={() => setMetaRow(row)}
                        >
                          {metaSummary(row.meta)}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {nextCursor && !loading ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => void handleLoadMore()} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={!!metaRow} onOpenChange={(open) => !open && setMetaRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit meta</DialogTitle>
            <DialogDescription>
              {metaRow ? `${metaRow.actionLabel} · ${formatWhen(metaRow.at)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs text-foreground">
            {metaRow ? JSON.stringify(metaRow.meta, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
