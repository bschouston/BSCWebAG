"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Phase = "staging" | "live" | "retired";

type Config = {
  phase: Phase;
  importsLocked: boolean;
  liveAt: string | null;
  currentImportId: string | null;
};

type Entitlement = {
  its: string;
  name: string;
  email: string;
  tokens: number;
  status: "pending" | "credited";
  matchStatus: "unmatched" | "its_not_claimed" | "email_and_its" | "its_only" | "credited";
  matchedUid: string | null;
  matchedEmail: string | null;
  matchedName: string | null;
  matchedTokenBalance: number | null;
  emailMatches: boolean;
  creditedAt: string | null;
  creditedBy: string | null;
};

function matchBadge(row: Entitlement) {
  switch (row.matchStatus) {
    case "credited":
      return <Badge variant="secondary">Credited</Badge>;
    case "email_and_its":
      return (
        <Badge className="border-transparent bg-teal-600 text-white dark:bg-teal-500 dark:text-[#122540]">
          Email + ITS
        </Badge>
      );
    case "its_only":
      return (
        <Badge className="border-transparent bg-amber-600 text-white dark:bg-amber-500 dark:text-[#122540]">
          ITS only
        </Badge>
      );
    case "its_not_claimed":
      return <Badge variant="outline">ITS not on site</Badge>;
    default:
      return <Badge variant="outline">Unmatched</Badge>;
  }
}

export default function LegacyTokenImportPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [rows, setRows] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [goLiveTyped, setGoLiveTyped] = useState("");
  const [creditTarget, setCreditTarget] = useState<Entitlement | null>(null);
  const [creditTyped, setCreditTyped] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("Not signed in");
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/super-admin/legacy-token-import", { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setConfig(data.config);
      setRows(Array.isArray(data.entitlements) ? data.entitlements : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending");
    const credited = rows.filter((r) => r.status === "credited");
    const both = pending.filter((r) => r.matchStatus === "email_and_its");
    const itsOnly = pending.filter((r) => r.matchStatus === "its_only");
    const unmatched = pending.filter((r) => r.matchStatus === "unmatched");
    return {
      pending: pending.length,
      credited: credited.length,
      both: both.length,
      itsOnly: itsOnly.length,
      unmatched: unmatched.length,
      pendingTokens: pending.reduce((s, r) => s + r.tokens, 0),
      creditedTokens: credited.reduce((s, r) => s + r.tokens, 0),
    };
  }, [rows]);

  const uploadCsv = async (file: File) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/super-admin/legacy-token-import", {
        method: "POST",
        headers,
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMessage(
        `Staged ${data.rowCount} members (${data.totalTokens} tokens). Skipped ${data.skippedZero} zero-token rows.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const postAction = async (action: string) => {
    const headers = {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    };
    const res = await fetch("/api/super-admin/legacy-token-import", {
      method: "POST",
      headers,
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Action failed");
    return data;
  };

  const confirmGoLive = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAction("go_live");
      setGoLiveOpen(false);
      setGoLiveTyped("");
      setMessage("Go live complete. Imports are locked. Members can claim; you can credit.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Go live failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmCredit = async () => {
    if (!creditTarget || !user) return;
    setBusy(true);
    setError(null);
    try {
      const headers = {
        ...(await authHeaders()),
        "Content-Type": "application/json",
      };
      const res = await fetch("/api/super-admin/legacy-token-import/credit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          its: creditTarget.its,
          requireEmailMatch: creditTarget.matchStatus === "email_and_its",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Credit failed");
      setCreditTarget(null);
      setCreditTyped("");
      setMessage(`Credited ${data.tokens} tokens.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Credit failed");
    } finally {
      setBusy(false);
    }
  };

  const setRetired = async (retired: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await postAction(retired ? "retire" : "unretire");
      setRetireOpen(false);
      setMessage(retired ? "Soft sunset active (claims/credits paused)." : "Returned to live.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const phase = config?.phase ?? "staging";
  const canImport = phase === "staging";
  const canCredit = phase === "live";

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="container space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Legacy token import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Temporary migration from the previous app. CSV columns: Name, Email, ITS, Tokens. Soft sunset
          only — no in-app delete.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">Status</CardTitle>
          <CardDescription>
            Phase: <span className="font-semibold text-foreground">{phase}</span>
            {config?.importsLocked ? " · imports locked" : " · imports open"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">{summary.pending} pending</Badge>
          <Badge variant="outline">{summary.credited} credited</Badge>
          <Badge variant="outline">{summary.both} email+ITS</Badge>
          <Badge variant="outline">{summary.itsOnly} ITS only</Badge>
          <Badge variant="outline">{summary.unmatched} unmatched</Badge>
          <Badge variant="secondary">{summary.pendingTokens} tokens pending</Badge>
          <Badge variant="secondary">{summary.creditedTokens} tokens credited</Badge>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-[#1a3556] dark:text-[#ffd700]">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">CSV upload</CardTitle>
          <CardDescription>
            Staging only. Re-upload replaces pending rows. Rejected if header/rows are invalid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="file"
            accept=".csv,text/csv"
            disabled={!canImport || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadCsv(file);
            }}
          />
          {!canImport ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Imports are locked after Go live.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {phase === "staging" ? (
          <Button
            className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={busy || rows.length === 0}
            onClick={() => {
              setGoLiveTyped("");
              setGoLiveOpen(true);
            }}
          >
            Go live
          </Button>
        ) : null}
        {phase === "live" ? (
          <Button variant="outline" disabled={busy} onClick={() => setRetireOpen(true)}>
            Soft sunset (retire)
          </Button>
        ) : null}
        {phase === "retired" ? (
          <Button
            className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={busy}
            onClick={() => void setRetired(false)}
          >
            Return to live
          </Button>
        ) : null}
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">Entitlements</CardTitle>
          <CardDescription>
            Admin credit requires the member to have claimed ITS on this site. ITS-only matches need
            typed CREDIT confirm. Wrong credit: use token request (no reverse).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staged rows yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>CSV email</TableHead>
                    <TableHead>ITS</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Site member</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.its}>
                      <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell className="font-mono text-sm">{row.its}</TableCell>
                      <TableCell className="tabular-nums">{row.tokens}</TableCell>
                      <TableCell>{matchBadge(row)}</TableCell>
                      <TableCell className="text-sm">
                        {row.matchedUid ? (
                          <div className="space-y-0.5">
                            <Link
                              href={`/admin/members/${row.matchedUid}?tab=wallet`}
                              className="font-medium text-[#1a3556] underline-offset-4 hover:underline dark:text-[#ffd700]"
                            >
                              {row.matchedName || row.matchedUid}
                            </Link>
                            <p className="text-xs text-muted-foreground">{row.matchedEmail}</p>
                            {row.matchStatus === "its_only" ? (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                Email differs from CSV
                              </p>
                            ) : null}
                            {typeof row.matchedTokenBalance === "number" ? (
                              <p className="text-xs text-muted-foreground">
                                Balance {row.matchedTokenBalance}
                              </p>
                            ) : null}
                          </div>
                        ) : row.status === "credited" ? (
                          <span className="text-muted-foreground">Credited</span>
                        ) : (
                          <span className="text-muted-foreground">No ITS claim yet</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canCredit && row.status === "pending" && row.matchedUid ? (
                          <Button
                            size="sm"
                            variant={row.matchStatus === "its_only" ? "outline" : "default"}
                            className={
                              row.matchStatus === "email_and_its"
                                ? "bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
                                : undefined
                            }
                            disabled={busy}
                            onClick={() => {
                              setCreditTyped("");
                              setCreditTarget(row);
                            }}
                          >
                            Credit
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={goLiveOpen} onOpenChange={setGoLiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Go live?</DialogTitle>
            <DialogDescription>
              Locks further CSV imports and opens member claims + admin credits. Type{" "}
              <span className="font-mono font-semibold text-foreground">GO LIVE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={goLiveTyped}
            onChange={(e) => setGoLiveTyped(e.target.value)}
            placeholder="GO LIVE"
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoLiveOpen(false)}>
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={goLiveTyped.trim().toUpperCase() !== "GO LIVE" || busy}
              onClick={() => void confirmGoLive()}
            >
              {busy ? "Working…" : "Go live"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creditTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreditTarget(null);
            setCreditTyped("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credit legacy tokens?</DialogTitle>
            <DialogDescription className="space-y-2 text-left">
              {creditTarget ? (
                <>
                  <span className="block text-foreground">
                    Credit <span className="font-semibold">{creditTarget.tokens}</span> tokens to{" "}
                    <span className="font-semibold">
                      {creditTarget.matchedName || creditTarget.matchedUid}
                    </span>{" "}
                    (ITS {creditTarget.its}).
                  </span>
                  {creditTarget.matchStatus === "its_only" ? (
                    <span className="block text-amber-800 dark:text-amber-200">
                      Warning: site email ({creditTarget.matchedEmail}) does not match CSV email (
                      {creditTarget.email}). Type{" "}
                      <span className="font-mono font-semibold text-foreground">CREDIT</span> to
                      confirm.
                    </span>
                  ) : (
                    <span className="block">
                      Email and ITS match. Type{" "}
                      <span className="font-mono font-semibold text-foreground">CREDIT</span> to
                      confirm.
                    </span>
                  )}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={creditTyped}
            onChange={(e) => setCreditTyped(e.target.value)}
            placeholder="CREDIT"
            autoComplete="off"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreditTarget(null);
                setCreditTyped("");
              }}
            >
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={creditTyped.trim().toUpperCase() !== "CREDIT" || busy}
              onClick={() => void confirmCredit()}
            >
              {busy ? "Crediting…" : "Credit tokens"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retireOpen} onOpenChange={setRetireOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Soft sunset?</DialogTitle>
            <DialogDescription>
              Hides member claim banners and pauses admin credits. Data is kept. You can return to
              live later. Imports stay locked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireOpen(false)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void setRetired(true)}>
              {busy ? "Working…" : "Retire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
