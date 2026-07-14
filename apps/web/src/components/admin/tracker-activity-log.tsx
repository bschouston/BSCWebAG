"use client";

import { useCallback, useEffect, useState } from "react";
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

const ACTION_OPTIONS = Object.entries(TRACKER_AUDIT_ACTION_LABELS) as [TrackerAuditAction, string][];

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TrackerActivityLog({
  lockedTournamentId,
  title = "Tracker activity log",
  description = "Logins, match tracking sessions, and stats recorded in the tracker console.",
}: {
  lockedTournamentId?: string;
  title?: string;
  description?: string;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [tournamentId, setTournamentId] = useState(lockedTournamentId ?? "");
  const [matchId, setMatchId] = useState("");
  const [action, setAction] = useState<string>("all");
  const [sort, setSort] = useState<"email" | "time">("email");

  useEffect(() => {
    if (lockedTournamentId) setTournamentId(lockedTournamentId);
  }, [lockedTournamentId]);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const params = new URLSearchParams({ sort });
    if (email.trim()) params.set("email", email.trim());
    const tid = (lockedTournamentId ?? tournamentId).trim();
    if (tid) params.set("tournamentId", tid);
    if (matchId.trim()) params.set("matchId", matchId.trim());
    if (action !== "all") params.set("action", action);

    const res = await fetch(`/api/admin/tracker-audit?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setRows(data.logs ?? []);
    setLoading(false);
  }, [user, email, tournamentId, matchId, action, sort, lockedTournamentId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const clearFilters = () => {
    setEmail("");
    if (!lockedTournamentId) setTournamentId("");
    setMatchId("");
    setAction("all");
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gmail / user email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Filter by email"
              />
            </div>
            {!lockedTournamentId ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tournament ID</Label>
                <Input
                  value={tournamentId}
                  onChange={(e) => setTournamentId(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Match ID</Label>
              <Input
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Select value={action} onValueChange={setAction}>
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
              <Label className="text-xs text-muted-foreground">Sort by</Label>
              <Select value={sort} onValueChange={(v) => setSort(v as "email" | "time")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Gmail user (A–Z)</SelectItem>
                  <SelectItem value="time">Time (newest first)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Apply filters"}
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {rows.length} event{rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Tournament</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Stat / detail</TableHead>
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
                      No tracker activity found.
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
