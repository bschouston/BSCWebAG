"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { TRACKER_AUDIT_ACTION_LABELS, type TrackerAuditAction } from "@bsc/shared";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AuditRow = {
  id: string;
  createdAt: string | null;
  userEmail: string | null;
  userDisplayName: string;
  action: TrackerAuditAction;
  actionLabel: string;
  tournamentName: string | null;
  matchId: string | null;
  teamKey: string | null;
  teamName: string | null;
  setNumber: number | null;
  statLabel: string | null;
  playerName: string | null;
};

type SortField =
  | "createdAt"
  | "userEmail"
  | "action"
  | "tournamentName"
  | "teamName"
  | "statLabel";

type TournamentOption = { id: string; name: string };

const ACTION_OPTIONS = Object.entries(TRACKER_AUDIT_ACTION_LABELS) as [TrackerAuditAction, string][];

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SortableHead({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
        onClick={() => onSort(field)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function TrackerActivityLog({
  initialTournamentId = "",
  title = "Tracker activity log",
  description = "Logins, match tracking sessions, simulations, and stats recorded in the tracker console.",
}: {
  initialTournamentId?: string;
  title?: string;
  description?: string;
}) {
  const { user } = useAuth();

  const [emailOptions, setEmailOptions] = useState<string[]>([]);
  const [tournamentOptions, setTournamentOptions] = useState<TournamentOption[]>([]);

  const [emailDraft, setEmailDraft] = useState("all");
  const [tournamentIdDraft, setTournamentIdDraft] = useState(
    initialTournamentId || "all"
  );
  const [matchIdDraft, setMatchIdDraft] = useState("");
  const [actionDraft, setActionDraft] = useState<string>("all");
  const [pageSizeDraft, setPageSizeDraft] = useState<number>(50);

  const [email, setEmail] = useState("all");
  const [tournamentId, setTournamentId] = useState(initialTournamentId || "all");
  const [matchId, setMatchId] = useState("");
  const [action, setAction] = useState<string>("all");
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [appliedVersion, setAppliedVersion] = useState(0);

  useEffect(() => {
    if (initialTournamentId) {
      setTournamentIdDraft(initialTournamentId);
      setTournamentId(initialTournamentId);
    }
  }, [initialTournamentId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadOptions = async () => {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [trackersRes, tournamentsRes, accessRes] = await Promise.all([
        fetch("/api/admin/trackers", { headers }),
        fetch("/api/tournaments", { headers }),
        fetch("/api/admin/tracker-access", { headers }),
      ]);
      if (cancelled) return;

      const emails = new Set<string>();
      if (trackersRes.ok) {
        const data = await trackersRes.json();
        for (const t of [...(data.tabletTrackers ?? []), ...(data.googleTrackers ?? [])]) {
          const e = String(t.email ?? "")
            .trim()
            .toLowerCase();
          if (e) emails.add(e);
        }
      }
      if (accessRes.ok) {
        const data = await accessRes.json();
        for (const row of data.authorizedEmails ?? []) {
          const e = String(row.email ?? "")
            .trim()
            .toLowerCase();
          if (e) emails.add(e);
        }
      }
      setEmailOptions([...emails].sort((a, b) => a.localeCompare(b)));

      if (tournamentsRes.ok) {
        const data = await tournamentsRes.json();
        const opts: TournamentOption[] = (data.tournaments ?? []).map(
          (t: { id: string; name?: string }) => ({
            id: t.id,
            name: String(t.name ?? t.id),
          })
        );
        opts.sort((a, b) => a.name.localeCompare(b.name));
        setTournamentOptions(opts);
      }
    };
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const token = await user?.getIdToken();
        const params = new URLSearchParams({
          sortField,
          sortDir,
          pageSize: String(pageSize),
        });
        if (email !== "all") params.set("email", email);
        if (tournamentId !== "all") params.set("tournamentId", tournamentId);
        if (matchId.trim()) params.set("matchId", matchId.trim());
        if (action !== "all") params.set("action", action);
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/admin/tracker-audit?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRows([]);
          setNextCursor(null);
          setError(typeof data?.error === "string" ? data.error : "Failed to load activity");
          return;
        }
        setRows(data.logs ?? []);
        setNextCursor(data.nextCursor ?? null);
      } catch (e: unknown) {
        setRows([]);
        setNextCursor(null);
        setError(e instanceof Error ? e.message : "Failed to load activity");
      } finally {
        setLoading(false);
      }
    },
    [user, email, tournamentId, matchId, action, sortField, sortDir, pageSize]
  );

  useEffect(() => {
    if (!user) return;
    setCursorStack([null]);
    setPageIndex(0);
    void loadPage(null);
  }, [user, email, tournamentId, matchId, action, sortField, sortDir, pageSize, appliedVersion, loadPage]);

  const applyFilters = () => {
    setEmail(emailDraft);
    setTournamentId(tournamentIdDraft);
    setMatchId(matchIdDraft.trim());
    setAction(actionDraft);
    setPageSize(pageSizeDraft);
    setAppliedVersion((v) => v + 1);
  };

  const clearFilters = () => {
    const resetTournament = initialTournamentId || "all";
    setEmailDraft("all");
    setTournamentIdDraft(resetTournament);
    setMatchIdDraft("");
    setActionDraft("all");
    setPageSizeDraft(50);
    setEmail("all");
    setTournamentId(resetTournament);
    setMatchId("");
    setAction("all");
    setPageSize(50);
    setSortField("createdAt");
    setSortDir("desc");
    setAppliedVersion((v) => v + 1);
  };

  const onSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
  };

  const goNext = () => {
    if (!nextCursor || loading) return;
    const nextIndex = pageIndex + 1;
    setCursorStack((prev) => {
      const copy = prev.slice(0, pageIndex + 1);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex(nextIndex);
    void loadPage(nextCursor);
  };

  const goPrev = () => {
    if (pageIndex <= 0 || loading) return;
    const prevIndex = pageIndex - 1;
    const cursor = cursorStack[prevIndex] ?? null;
    setPageIndex(prevIndex);
    void loadPage(cursor);
  };

  const tournamentLabel = useMemo(() => {
    const map = new Map(tournamentOptions.map((t) => [t.id, t.name]));
    return (id: string) => map.get(id) ?? id;
  }, [tournamentOptions]);

  return (
    <div className="space-y-4 max-w-7xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gmail / user email</Label>
              <Select value={emailDraft} onValueChange={setEmailDraft}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {emailOptions.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tournament</Label>
              <Select value={tournamentIdDraft} onValueChange={setTournamentIdDraft}>
                <SelectTrigger>
                  <SelectValue placeholder="All tournaments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tournaments</SelectItem>
                  {tournamentOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {initialTournamentId &&
                  !tournamentOptions.some((t) => t.id === initialTournamentId) ? (
                    <SelectItem value={initialTournamentId}>
                      {tournamentLabel(initialTournamentId)}
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Match ID</Label>
              <Input
                value={matchIdDraft}
                onChange={(e) => setMatchIdDraft(e.target.value)}
                placeholder="Any part of match ID"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={actionDraft} onValueChange={setActionDraft}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTION_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Page size</Label>
              <Select
                value={String(pageSizeDraft)}
                onValueChange={(v) => setPageSizeDraft(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Loading…" : "Apply filters"}
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Clear filters
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={goPrev} disabled={loading || pageIndex <= 0}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {pageIndex + 1}
                {rows.length > 0 ? ` · ${rows.length} event${rows.length === 1 ? "" : "s"}` : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={loading || !nextCursor}
              >
                Next
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="When"
                    field="createdAt"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHead
                    label="User"
                    field="userEmail"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHead
                    label="Action"
                    field="action"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHead
                    label="Tournament"
                    field="tournamentName"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHead
                    label="Team"
                    field="teamName"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                  <SortableHead
                    label="Stat / detail"
                    field="statLabel"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      {error ? "—" : "No tracker activity found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatWhen(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{r.userEmail ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.userDisplayName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.actionLabel}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.tournamentName ?? "—"}</div>
                        {r.matchId ? (
                          <div className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                            {r.matchId}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.teamName ? (
                          <>
                            {r.teamName}
                            {r.teamKey ? (
                              <span className="text-muted-foreground"> ({r.teamKey})</span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                        {r.setNumber != null ? (
                          <div className="text-xs text-muted-foreground">Set {r.setNumber}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.statLabel ? (
                          <>
                            {r.statLabel}
                            {r.playerName ? (
                              <div className="text-xs text-muted-foreground">{r.playerName}</div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
