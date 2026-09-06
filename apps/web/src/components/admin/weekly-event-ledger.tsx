"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  OUTCOME_LABELS,
  type WeeklyEventLedgerResponse,
  type WeeklyLedgerOutcome,
} from "@/lib/weekly-event-ledger";
import { chicagoTimeLabel } from "@/lib/weekly-rsvp";

function formatWhen(iso: string | null): string {
  return chicagoTimeLabel(iso);
}

function outcomeClass(outcome: WeeklyLedgerOutcome): string {
  if (outcome === "attended") return "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300";
  if (outcome === "no_show") return "bg-[#fff8d6] text-[#8a6d00] dark:bg-[#122540] dark:text-[#ffd700]";
  if (outcome === "event_cancelled") return "bg-muted text-foreground";
  return "bg-[#e8eef4] text-[#1a3556] dark:bg-[#1a3556] dark:text-[#ffd700]";
}

function signedClass(signed: number | null): string {
  if (signed == null) return "text-muted-foreground";
  if (signed > 0) return "text-teal-800 dark:text-teal-300";
  if (signed < 0) return "text-[#1a3556] dark:text-[#ffd700]";
  return "text-muted-foreground";
}

function formatSigned(signed: number | null): string {
  if (signed == null) return "—";
  if (signed > 0) return `+${signed}`;
  return String(signed);
}

export function WeeklyEventLedger({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<WeeklyEventLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/weekly-events/${eventId}/ledger`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Failed to load ledger");
        setData(body as WeeklyEventLedgerResponse);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load ledger");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [eventId, user]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading event ledger…</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error ?? "Ledger unavailable"}</p>;
  }

  const { totals, members, activity } = data;

  return (
    <div className="space-y-6">
      <Card id="ledger" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">Event ledger</CardTitle>
          <CardDescription>
            Token charges, refunds, and admin actions after this occurrence closed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Attendees charged</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.attendeesCharged}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Cost per attendee</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">
                {totals.costPerAttendee ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Net tokens collected</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.netCollected}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Net tokens refunded</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.tokensRefunded}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">No-shows</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.noShowCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Waitlist released</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.waitlistReleased}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">RSVPs cancelled</p>
              <p className="text-2xl font-semibold text-[#1a3556] dark:text-white">{totals.cancelledRsvps}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="ledger-members" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">Members</CardTitle>
          <CardDescription>Who was charged, refunded, or penalized for this event.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No RSVPs for this event.</p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {members.map((m) => (
                  <li key={m.rsvpId} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {m.userId ? (
                          <Link
                            href={`/admin/members/${m.userId}`}
                            className="font-semibold text-[#1a3556] underline-offset-4 hover:underline dark:text-foreground"
                          >
                            {m.name}
                          </Link>
                        ) : (
                          <p className="font-semibold text-[#1a3556] dark:text-foreground">{m.name}</p>
                        )}
                        <Badge className={`mt-1 border-transparent ${outcomeClass(m.outcome)}`}>
                          {OUTCOME_LABELS[m.outcome]}
                        </Badge>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-semibold tabular-nums text-[#1a3556] dark:text-[#ffd700]">
                          {m.tokensCharged}
                        </p>
                        <p className="text-xs text-muted-foreground">charged</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Held {m.tokensHeld} · net refunded {m.tokensRefunded}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Held</TableHead>
                      <TableHead className="text-right">Charged</TableHead>
                      <TableHead className="text-right">Net refunded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.rsvpId}>
                        <TableCell className="font-semibold whitespace-normal text-[#1a3556] dark:text-foreground">
                          {m.userId ? (
                            <Link
                              href={`/admin/members/${m.userId}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {m.name}
                            </Link>
                          ) : (
                            m.name
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`border-transparent ${outcomeClass(m.outcome)}`}>
                            {OUTCOME_LABELS[m.outcome]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.tokensHeld}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-[#1a3556] dark:text-[#ffd700]">
                          {m.tokensCharged}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {m.tokensRefunded}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card id="ledger-activity" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-[#1a3556] dark:text-foreground">Activity</CardTitle>
          <CardDescription>Chronological history of token moves and admin actions.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity for this event.</p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {activity.map((row) => (
                  <li key={row.id} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{formatWhen(row.at)}</p>
                    <p className="font-semibold text-[#1a3556] dark:text-foreground">{row.label}</p>
                    {row.name ? <p className="text-sm text-foreground">{row.name}</p> : null}
                    {row.description ? (
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    ) : null}
                    {row.signedAmount != null ? (
                      <p className={`mt-1 text-lg font-semibold tabular-nums ${signedClass(row.signedAmount)}`}>
                        {formatSigned(row.signedAmount)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatWhen(row.at)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p className="font-medium text-foreground">{row.label}</p>
                          {row.description ? (
                            <p className="text-xs text-muted-foreground">{row.description}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-normal text-[#1a3556] dark:text-foreground">
                          {row.userId ? (
                            <Link
                              href={`/admin/members/${row.userId}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            row.name ?? "—"
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold ${signedClass(row.signedAmount)}`}
                        >
                          {formatSigned(row.signedAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
