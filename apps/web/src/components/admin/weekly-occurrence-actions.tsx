"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeTokensFinal } from "@/lib/weekly-tokens";
import { effectiveRsvpWindowState, weeklyRsvpWindow } from "@/lib/rsvp-window";
import { ArrowDown, ArrowUp, Ban, Loader2, Mail, UserCheck, UserX } from "lucide-react";

type RsvpStatusDraft = "CONFIRMED" | "WAITLISTED";

type RsvpRow = {
  id: string;
  status?: string;
  noShow?: boolean;
  attended?: boolean;
  tokensHeld?: number | null;
  noShowRefunded?: number | null;
  pendingTokenIncreaseTo?: number | null;
  attendanceAuthReminderSentAt?: string | null;
  createdAt?: string | null;
  waitlistPosition?: number | null;
  user?: { firstName?: string; lastName?: string; email?: string } | null;
};

type AttendanceDraft = { outcome: "attended" | "no_show"; refundHeld: number };

function memberLabel(r: RsvpRow) {
  return [r.user?.firstName, r.user?.lastName].filter(Boolean).join(" ") || r.user?.email || r.id;
}

function originalHold(r: RsvpRow) {
  return Math.max(0, (Number(r.tokensHeld) || 0) + (Number(r.noShowRefunded) || 0));
}

function needsPendingAuth(r: RsvpRow) {
  return (Number(r.pendingTokenIncreaseTo) || 0) > (Number(r.tokensHeld) || 0);
}

function signupMs(r: RsvpRow) {
  if (!r.createdAt) return 0;
  const t = new Date(r.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortBySignup(a: RsvpRow, b: RsvpRow) {
  return signupMs(a) - signupMs(b);
}

function savedStatus(r: RsvpRow): RsvpStatusDraft {
  return r.status === "WAITLISTED" ? "WAITLISTED" : "CONFIRMED";
}

function draftFromRow(r: RsvpRow): AttendanceDraft {
  const orig = originalHold(r);
  if (r.noShow) {
    return { outcome: "no_show", refundHeld: Number(r.noShowRefunded) || 0 };
  }
  return { outcome: "attended", refundHeld: orig };
}

function formatWhen(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function rsvpOverrideButtonClass(active: boolean) {
  return active
    ? "h-11 bg-[#1a3556] px-5 text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
    : "h-11 px-5 disabled:bg-muted disabled:text-foreground disabled:opacity-100";
}

export function WeeklyRsvpWindowCard({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = event.status === "COMPLETED" || event.status === "CANCELLED";
  const scheduledState = effectiveRsvpWindowState({
    opensAt: event.rsvpOpensAt,
    closesAt: event.rsvpClosesAt,
    override: null,
  });
  const effectiveState = weeklyRsvpWindow(event);
  const override = event.rsvpManualOverride ?? null;
  const rsvpsOpen = effectiveState === "open";

  const setOverride = async (rsvpManualOverride: "open" | "closed" | null) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "set_rsvp_override", rsvpManualOverride }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      onEventChange({
        rsvpManualOverride: (data.rsvpManualOverride ?? null) as SportEvent["rsvpManualOverride"],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const scheduledNote =
    scheduledState === "before"
      ? "not open yet by schedule"
      : scheduledState === "closed"
        ? "closed by schedule"
        : "inside the scheduled window";
  const overrideNote =
    override === "open"
      ? "Manually opened — members can RSVP regardless of the schedule."
      : override === "closed"
        ? "Manually closed — members cannot RSVP until you reopen or return to the schedule."
        : "Following the scheduled window.";

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-[#1a3556] dark:text-foreground">
          {rsvpsOpen ? "RSVPs are open" : "RSVPs are closed"}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Scheduled window: {formatWhen(event.rsvpOpensAt)} – {formatWhen(event.rsvpClosesAt)} ({scheduledNote}).{" "}
          {overrideNote}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={rsvpsOpen ? "default" : "outline"}
            className={rsvpOverrideButtonClass(rsvpsOpen)}
            disabled={done || busy}
            onClick={() => void setOverride(scheduledState === "open" ? null : "open")}
          >
            {busy && !rsvpsOpen ? "Opening…" : "Open RSVPs now"}
          </Button>
          <Button
            type="button"
            variant={!rsvpsOpen ? "default" : "outline"}
            className={rsvpOverrideButtonClass(!rsvpsOpen)}
            disabled={done || busy}
            onClick={() => void setOverride(scheduledState === "closed" ? null : "closed")}
          >
            {busy && rsvpsOpen ? "Closing…" : "Close RSVPs now"}
          </Button>
          {override ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 px-5 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={done || busy}
              onClick={() => void setOverride(null)}
            >
              {busy ? "Updating…" : "Return to scheduled window"}
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function WeeklyCancelEventButton({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelTyped, setCancelTyped] = useState("");
  const done = event.status === "COMPLETED" || event.status === "CANCELLED";

  const close = () => {
    setOpen(false);
    setCancelTyped("");
    setError(null);
  };

  const cancelEvent = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cancel_event" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      onEventChange({ status: "CANCELLED", confirmedCount: 0, waitlistCount: 0 });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
        disabled={done || busy}
        onClick={() => setOpen(true)}
      >
        {busy ? "Cancelling…" : "Cancel event"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this event?</DialogTitle>
            <DialogDescription>
              All confirmed and waitlisted RSVPs will be cancelled and token holds refunded. Type{" "}
              <span className="font-mono font-semibold text-foreground">CANCEL</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={cancelTyped}
            onChange={(e) => setCancelTyped(e.target.value)}
            placeholder="CANCEL"
            autoComplete="off"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Back
            </Button>
            <Button
              variant="destructive"
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={cancelTyped.trim().toUpperCase() !== "CANCEL" || busy}
              onClick={() => void cancelEvent()}
            >
              {busy ? "Cancelling…" : "Cancel event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function draftWaitlistPosition(
  rows: RsvpRow[],
  statusOf: (r: RsvpRow) => RsvpStatusDraft,
  id: string
) {
  const waitlisted = rows.filter((r) => statusOf(r) === "WAITLISTED");
  const previous = waitlisted
    .filter((r) => savedStatus(r) === "WAITLISTED")
    .sort(
      (a, b) =>
        (typeof a.waitlistPosition === "number" ? a.waitlistPosition : 9999) -
        (typeof b.waitlistPosition === "number" ? b.waitlistPosition : 9999)
    );
  const demoted = waitlisted.filter((r) => savedStatus(r) === "CONFIRMED").sort(sortBySignup);
  return [...previous, ...demoted].findIndex((r) => r.id === id) + 1;
}

function rsvpStatusLabel(opts: {
  status: RsvpStatusDraft;
  pending: boolean;
  waitlistPosition: number | null;
}) {
  if (opts.status === "WAITLISTED") {
    return `Waitlisted${opts.waitlistPosition ? ` (#${opts.waitlistPosition})` : ""}`;
  }
  if (opts.pending) return "Confirmed · extra hold needed";
  return "Confirmed";
}

function IconAction({
  label,
  active,
  destructive,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={destructive ? "destructive" : active ? "default" : "outline"}
      className={
        active && !destructive
          ? "h-9 w-9 bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
          : "h-9 w-9 disabled:bg-muted disabled:text-foreground disabled:opacity-100"
      }
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function AttendanceRowActions({
  status,
  pending,
  livePendingConfirmed,
  draft,
  reminderSent,
  done,
  busy,
  remindBusy,
  onAttended,
  onNoShow,
  onRemind,
  onCancel,
  onPromote,
  onDemote,
}: {
  status: RsvpStatusDraft;
  pending: boolean;
  livePendingConfirmed: boolean;
  draft: AttendanceDraft | null;
  reminderSent: boolean;
  done: boolean;
  busy: boolean;
  remindBusy: boolean;
  onAttended: () => void;
  onNoShow: () => void;
  onRemind: () => void;
  onCancel: () => void;
  onPromote: () => void;
  onDemote: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "WAITLISTED" ? (
        <IconAction label="Promote from waitlist" disabled={done || busy} onClick={onPromote}>
          <ArrowUp className="h-4 w-4" />
        </IconAction>
      ) : (
        <IconAction label="Demote to waitlist" disabled={done || busy} onClick={onDemote}>
          <ArrowDown className="h-4 w-4" />
        </IconAction>
      )}
      {status === "CONFIRMED" && !pending && draft ? (
        <>
          <IconAction
            label="Attended"
            active={draft.outcome === "attended"}
            disabled={done || busy}
            onClick={onAttended}
          >
            <UserCheck className="h-4 w-4" />
          </IconAction>
          <IconAction
            label="No-show"
            active={draft.outcome === "no_show"}
            disabled={done || busy}
            onClick={onNoShow}
          >
            <UserX className="h-4 w-4" />
          </IconAction>
        </>
      ) : null}
      {livePendingConfirmed ? (
        <IconAction
          label={reminderSent ? "Authorize email already sent" : "Send authorize email"}
          disabled={done || busy || reminderSent}
          onClick={onRemind}
        >
          {remindBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        </IconAction>
      ) : null}
      {livePendingConfirmed ? (
        <IconAction label="Cancel RSVP" destructive disabled={done || busy} onClick={onCancel}>
          <Ban className="h-4 w-4" />
        </IconAction>
      ) : null}
    </div>
  );
}

export function WeeklyOccurrenceActions({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [baseline, setBaseline] = useState<Record<string, AttendanceDraft>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, RsvpStatusDraft>>({});
  const [statusBaseline, setStatusBaseline] = useState<Record<string, RsvpStatusDraft>>({});
  const [dialog, setDialog] = useState(false);
  const [ackFinalize, setAckFinalize] = useState(false);
  const [cancelRsvpId, setCancelRsvpId] = useState<string | null>(null);
  const [ackCancel, setAckCancel] = useState(false);
  const [remindRsvpId, setRemindRsvpId] = useState<string | null>(null);
  const [ackRemind, setAckRemind] = useState(false);

  const done = event.status === "COMPLETED" || event.status === "CANCELLED";
  const ordered = [...rsvps].sort(sortBySignup);
  const statusOf = (r: RsvpRow): RsvpStatusDraft => statusDrafts[r.id] ?? savedStatus(r);
  const draftConfirmed = ordered.filter((r) => statusOf(r) === "CONFIRMED");
  const readyRows = draftConfirmed.filter((r) => !needsPendingAuth(r));
  const savedPendingAuth = rsvps.filter((r) => savedStatus(r) === "CONFIRMED" && needsPendingAuth(r));
  const savedReady = rsvps.filter((r) => savedStatus(r) === "CONFIRMED" && !needsPendingAuth(r));
  const waitlistedCount = ordered.filter((r) => statusOf(r) === "WAITLISTED").length;
  const attendeeCount = draftConfirmed.filter((r) => {
    if (needsPendingAuth(r)) return true;
    const d = drafts[r.id] ?? draftFromRow(r);
    return d.outcome !== "no_show";
  }).length;
  const attendedDraftCount = readyRows.filter((r) => (drafts[r.id] ?? draftFromRow(r)).outcome === "attended")
    .length;
  const minCapacity = Number(event.minCapacity) || 1;
  const maxCapacity = Number(event.capacity) || 1;
  const tokensMin = Number(event.tokensMin) || 0;
  const tokensMax = Number(event.tokensMax) || 0;
  const preview = computeTokensFinal({
    confirmedCount: attendeeCount,
    minCapacity,
    maxCapacity,
    tokensMin,
    tokensMax,
  });
  const holdMax = event.tokensMax ?? event.tokensRequired ?? 0;
  const capacityState =
    attendeeCount >= maxCapacity
      ? {
          label: "Max cap reached",
          className:
            "bg-[#e8eef4] text-[#1a3556] dark:bg-[#1a3556] dark:text-[#ffd700]",
        }
      : attendeeCount >= minCapacity
        ? {
            label: "Enough to proceed",
            className: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
          }
        : {
            label: "Min cap not reached",
            className: "bg-[#fff8d6] text-[#8a6d00] dark:bg-[#122540] dark:text-[#ffd700]",
          };
  const allReadyMarked = savedReady.every((r) => r.attended || r.noShow);
  const attendanceDirty =
    JSON.stringify(drafts) !== JSON.stringify(baseline) || (savedReady.length > 0 && !allReadyMarked);
  const statusDirty = JSON.stringify(statusDrafts) !== JSON.stringify(statusBaseline);
  const dirty = attendanceDirty || statusDirty;
  const attendanceSaved = Boolean(event.attendanceSavedAt);
  const canFinalize =
    !done &&
    !dirty &&
    savedPendingAuth.length === 0 &&
    (savedReady.length === 0 || (attendanceSaved && allReadyMarked));

  const loadRsvps = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/rsvps?eventId=${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    const rows = ((data.rsvps || []) as RsvpRow[])
      .filter((r) => r.status === "CONFIRMED" || r.status === "WAITLISTED")
      .sort(sortBySignup);
    setRsvps(rows);
    const nextAtt: Record<string, AttendanceDraft> = {};
    const nextStatus: Record<string, RsvpStatusDraft> = {};
    for (const r of rows) {
      nextStatus[r.id] = savedStatus(r);
      if (savedStatus(r) === "CONFIRMED" && !needsPendingAuth(r)) nextAtt[r.id] = draftFromRow(r);
    }
    setDrafts(nextAtt);
    setBaseline(nextAtt);
    setStatusDrafts(nextStatus);
    setStatusBaseline(nextStatus);
  }, [eventId, user]);

  useEffect(() => {
    void loadRsvps();
  }, [loadRsvps]);

  const closeDialog = () => {
    setDialog(false);
    setAckFinalize(false);
  };

  const closeCancelRsvp = () => {
    setCancelRsvpId(null);
    setAckCancel(false);
  };

  const closeRemind = () => {
    setRemindRsvpId(null);
    setAckRemind(false);
  };

  const setDraft = (id: string, patch: Partial<AttendanceDraft> | AttendanceDraft) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const setRowStatus = (r: RsvpRow, status: RsvpStatusDraft) => {
    setStatusDrafts((prev) => ({ ...prev, [r.id]: status }));
    if (status === "CONFIRMED" && !needsPendingAuth(r)) {
      setDrafts((prev) => ({ ...prev, [r.id]: prev[r.id] ?? draftFromRow(r) }));
    } else {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[r.id];
        return next;
      });
    }
  };

  const saveAttendance = async () => {
    if (!user) return;
    setBusy("save");
    setError(null);
    try {
      const token = await user.getIdToken();
      const members = ordered.map((r) => {
        const status = statusOf(r);
        if (status === "CONFIRMED" && !needsPendingAuth(r)) {
          const d = drafts[r.id] ?? draftFromRow(r);
          return { rsvpId: r.id, status, outcome: d.outcome, refundHeld: d.refundHeld };
        }
        return { rsvpId: r.id, status };
      });
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "save_attendance", members }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save attendance");
      onEventChange({
        attendanceSavedAt: new Date().toISOString() as unknown as SportEvent["attendanceSavedAt"],
        confirmedCount: data.confirmedCount,
        waitlistCount: data.waitlistCount,
      });
      await loadRsvps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save attendance");
    } finally {
      setBusy(null);
    }
  };

  const cancelPendingRsvp = async (rsvpId: string) => {
    if (!user) return;
    setBusy(`cancel:${rsvpId}`);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "cancel_rsvp", rsvpId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not cancel RSVP");
      onEventChange({
        confirmedCount: data.confirmedCount,
        waitlistCount: data.waitlistCount,
      });
      closeCancelRsvp();
      await loadRsvps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel RSVP");
    } finally {
      setBusy(null);
    }
  };

  const remindTokenAuth = async (rsvpId: string) => {
    if (!user) return;
    setBusy(`remind:${rsvpId}`);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "remind_token_auth", rsvpId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send authorize email");
      closeRemind();
      await loadRsvps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send authorize email");
    } finally {
      setBusy(null);
    }
  };

  const finalize = async () => {
    if (!user) return;
    setBusy("finalize");
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "finalize" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not finalize");
      onEventChange({ status: "COMPLETED", tokensFinal: data.tokensFinal });
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finalize");
    } finally {
      setBusy(null);
    }
  };

  const tokenFigureClass = "font-semibold tabular-nums text-[#1a3556] dark:text-[#ffd700]";
  const tokenLabelClass = "text-xs font-semibold uppercase tracking-wide text-[#8a6d00] dark:text-[#ffd700]";

  const memberView = (r: RsvpRow) => {
    const status = statusOf(r);
    const pending = needsPendingAuth(r);
    const orig = originalHold(r);
    const held = Number(r.tokensHeld) || 0;
    const required = Number(r.pendingTokenIncreaseTo) || 0;
    const draft = drafts[r.id] ?? (status === "CONFIRMED" && !pending ? draftFromRow(r) : null);
    return {
      status,
      unsaved: status !== savedStatus(r),
      pending,
      orig,
      held,
      required,
      draft,
      livePendingConfirmed: savedStatus(r) === "CONFIRMED" && pending && status === "CONFIRMED",
      reminderSent: Boolean(r.attendanceAuthReminderSentAt),
      wlPos: status === "WAITLISTED" ? draftWaitlistPosition(ordered, statusOf, r.id) : null,
    };
  };

  const rowActions = (r: RsvpRow, v: ReturnType<typeof memberView>) => (
    <AttendanceRowActions
      status={v.status}
      pending={v.pending}
      livePendingConfirmed={v.livePendingConfirmed}
      draft={v.draft}
      reminderSent={v.reminderSent}
      done={done}
      busy={!!busy}
      remindBusy={busy === `remind:${r.id}`}
      onAttended={() => v.draft && setDraft(r.id, { outcome: "attended", refundHeld: v.draft.refundHeld })}
      onNoShow={() =>
        v.draft &&
        setDraft(r.id, {
          outcome: "no_show",
          refundHeld: v.draft.outcome === "no_show" ? v.draft.refundHeld : v.orig,
        })
      }
      onRemind={() => setRemindRsvpId(r.id)}
      onCancel={() => setCancelRsvpId(r.id)}
      onPromote={() => setRowStatus(r, "CONFIRMED")}
      onDemote={() => setRowStatus(r, "WAITLISTED")}
    />
  );

  const refundField = (r: RsvpRow, v: ReturnType<typeof memberView>, idSuffix: string) =>
    v.status === "CONFIRMED" && !v.pending && v.draft?.outcome === "no_show" ? (
      <div className="mt-1 max-w-[8rem]">
        <Label htmlFor={`refund-${r.id}-${idSuffix}`} className="text-xs">
          Refund
        </Label>
        <Input
          id={`refund-${r.id}-${idSuffix}`}
          type="number"
          min={0}
          max={v.orig}
          value={v.draft.refundHeld}
          disabled={done || !!busy}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value) || 0);
            setDraft(r.id, { outcome: "no_show", refundHeld: Math.min(v.orig, Math.max(0, n)) });
          }}
        />
      </div>
    ) : null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-[#1a3556] dark:text-foreground">This week’s attendance</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Mark attendance, promote or demote waitlist, then save. Member history appears after you finalize or cancel.
          Finalize charges attendees and cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <p className={tokenLabelClass}>Attendees</p>
              <p className={`${tokenFigureClass} text-2xl sm:text-3xl`}>{attendeeCount}</p>
            </div>
            <div>
              <p className={tokenLabelClass}>Cost per attendee</p>
              <p className={`${tokenFigureClass} text-2xl sm:text-3xl`}>{preview}</p>
            </div>
          </div>
          <p
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${capacityState.className}`}
          >
            {capacityState.label}
          </p>
          {waitlistedCount ? (
            <p className="text-xs text-muted-foreground">
              {waitlistedCount} waitlisted
            </p>
          ) : null}
        </div>

        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed or waitlisted RSVPs.</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {ordered.map((r, index) => {
                const v = memberView(r);
                const statusTone =
                  v.status === "WAITLISTED"
                    ? "text-foreground"
                    : v.pending
                      ? "text-[#8a6d00] dark:text-[#ffd700]"
                      : "text-foreground";
                return (
                  <li key={r.id} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          #{index + 1} · {formatWhen(r.createdAt)}
                        </p>
                        <p className="font-semibold text-[#1a3556] dark:text-foreground">{memberLabel(r)}</p>
                        <p className={`text-sm ${statusTone}`}>
                          {rsvpStatusLabel({
                            status: v.status,
                            pending: v.pending,
                            waitlistPosition: v.wlPos,
                          })}
                        </p>
                        {v.unsaved ? (
                          <p className="text-xs text-[#8a6d00] dark:text-[#ffd700]">Unsaved</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-semibold tabular-nums text-[#1a3556] dark:text-[#ffd700]">
                          {v.pending ? `${v.held} → ${v.required}` : v.orig}
                        </p>
                        <p className="text-xs text-muted-foreground">{v.pending ? "held → required" : "held"}</p>
                        {refundField(r, v, "m")}
                      </div>
                    </div>
                    {rowActions(r, v)}
                  </li>
                );
              })}
            </ul>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>RSVP</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordered.map((r, index) => {
                    const v = memberView(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatWhen(r.createdAt)}
                        </TableCell>
                        <TableCell className="font-semibold whitespace-normal text-[#1a3556] dark:text-foreground">
                          {memberLabel(r)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p
                            className={`text-sm ${
                              v.pending && v.status === "CONFIRMED"
                                ? "text-[#8a6d00] dark:text-[#ffd700]"
                                : "text-foreground"
                            }`}
                          >
                            {rsvpStatusLabel({
                              status: v.status,
                              pending: v.pending,
                              waitlistPosition: v.wlPos,
                            })}
                          </p>
                          {v.unsaved ? (
                            <p className="text-xs text-[#8a6d00] dark:text-[#ffd700]">Unsaved</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <p className="text-xl font-semibold tabular-nums text-[#1a3556] dark:text-[#ffd700]">
                            {v.pending ? `${v.held} → ${v.required}` : v.orig}
                          </p>
                          <p className="text-xs text-muted-foreground">{v.pending ? "held → required" : "held"}</p>
                          {refundField(r, v, "d")}
                        </TableCell>
                        <TableCell className="whitespace-normal">{rowActions(r, v)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            className="w-full sm:w-auto disabled:bg-muted disabled:text-foreground disabled:opacity-100"
            disabled={done || !!busy || ordered.length === 0 || !dirty}
            onClick={() => void saveAttendance()}
          >
            {busy === "save" ? "Saving…" : "Save attendance"}
          </Button>
          <Button
            className="w-full sm:w-auto bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={!canFinalize || !!busy}
            title={
              savedPendingAuth.length > 0
                ? "Cancel or wait for extra token authorization before finalizing"
                : dirty
                  ? "Save attendance before finalizing"
                  : !attendanceSaved && savedReady.length > 0
                    ? "Save attendance before finalizing"
                    : undefined
            }
            onClick={() => setDialog(true)}
          >
            {busy === "finalize" ? "Finalizing…" : "Finalize tokens"}
          </Button>
        </div>
        {savedPendingAuth.length > 0 && !done && !statusDirty ? (
          <p className="text-sm text-[#8a6d00] dark:text-[#ffd700]">
            Finalize stays locked until extra token holds are authorized or those RSVPs are cancelled.
          </p>
        ) : dirty ? (
          <p className="text-sm text-[#8a6d00] dark:text-[#ffd700]">
            Save attendance to apply waitlist changes (members are emailed) and unlock finalize.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <Dialog open={dialog} onOpenChange={(open) => (open ? setDialog(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize tokens and complete this event?</DialogTitle>
            <DialogDescription>
              This completes the event and cannot be undone. {attendedDraftCount} attendee
              {attendedDraftCount === 1 ? "" : "s"} will be charged {preview} token{preview === 1 ? "" : "s"} each
              (held at {holdMax}). Unused hold is refunded. No-show refunds stay as you saved them. Waitlist holds are
              released. Member history on My Events updates after this completes.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={ackFinalize}
              onCheckedChange={(v) => setAckFinalize(v === true)}
              className="mt-0.5"
            />
            I understand this settles token charges and completes the event.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={!ackFinalize || !!busy}
              onClick={() => void finalize()}
            >
              {busy === "finalize" ? "Finalizing…" : "Complete event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={remindRsvpId !== null} onOpenChange={(open) => (open ? undefined : closeRemind())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send authorize email?</DialogTitle>
            <DialogDescription>
              {remindRsvpId
                ? `This sends one reminder to ${memberLabel(rsvps.find((r) => r.id === remindRsvpId) ?? { id: remindRsvpId })} to authorize the extra token hold. It cannot be sent again from attendance.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={ackRemind}
              onCheckedChange={(v) => setAckRemind(v === true)}
              className="mt-0.5"
            />
            Send this one-time authorize reminder now.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeRemind}>
              Back
            </Button>
            <Button
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={!ackRemind || !remindRsvpId || !!busy}
              onClick={() => remindRsvpId && void remindTokenAuth(remindRsvpId)}
            >
              {busy?.startsWith("remind:") ? "Sending…" : "Send email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelRsvpId !== null} onOpenChange={(open) => (open ? undefined : closeCancelRsvp())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this RSVP?</DialogTitle>
            <DialogDescription>
              {cancelRsvpId
                ? `${memberLabel(rsvps.find((r) => r.id === cancelRsvpId) ?? { id: cancelRsvpId })} will be cancelled and their original token hold refunded. A waitlisted member may be promoted.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              checked={ackCancel}
              onCheckedChange={(v) => setAckCancel(v === true)}
              className="mt-0.5"
            />
            Cancel this RSVP and refund the original hold.
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={closeCancelRsvp}>
              Back
            </Button>
            <Button
              variant="destructive"
              className="disabled:bg-muted disabled:text-foreground disabled:opacity-100"
              disabled={!ackCancel || !cancelRsvpId || !!busy}
              onClick={() => cancelRsvpId && void cancelPendingRsvp(cancelRsvpId)}
            >
              {busy?.startsWith("cancel:") ? "Cancelling…" : "Cancel RSVP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

