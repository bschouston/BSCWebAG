export type WeeklyLedgerOutcome =
  | "attended"
  | "no_show"
  | "waitlist_released"
  | "cancelled"
  | "event_cancelled";

export type WeeklyLedgerTokenKind =
  | "hold"
  | "hold_increase"
  | "settle_refund"
  | "noshow_refund"
  | "noshow_penalty"
  | "waitlist_release"
  | "event_cancelled"
  | "rsvp_cancelled"
  | "other";

export type WeeklyLedgerMember = {
  userId: string;
  rsvpId: string;
  name: string;
  email: string | null;
  outcome: WeeklyLedgerOutcome;
  tokensHeld: number;
  tokensCharged: number;
  tokensRefunded: number;
  tokensFinal: number | null;
  status: string;
};

export type WeeklyLedgerActivity = {
  id: string;
  at: string | null;
  source: "token" | "audit";
  kind: string;
  label: string;
  userId: string | null;
  name: string | null;
  type: "CREDIT" | "DEBIT" | null;
  amount: number | null;
  signedAmount: number | null;
  description: string | null;
};

export type WeeklyLedgerTotals = {
  attendeesCharged: number;
  costPerAttendee: number | null;
  netCollected: number;
  tokensRefunded: number;
  noShowCount: number;
  waitlistReleased: number;
  cancelledRsvps: number;
};

export type WeeklyEventLedgerResponse = {
  event: {
    id: string;
    title: string;
    status: string;
    tokensFinal: number | null;
  };
  totals: WeeklyLedgerTotals;
  members: WeeklyLedgerMember[];
  activity: WeeklyLedgerActivity[];
};

export const TOKEN_KIND_LABELS: Record<WeeklyLedgerTokenKind, string> = {
  hold: "Hold placed",
  hold_increase: "Extra hold authorized",
  settle_refund: "Unused hold refunded",
  noshow_refund: "No-show refund",
  noshow_penalty: "No-show penalty",
  waitlist_release: "Waitlist released",
  event_cancelled: "Event cancelled refund",
  rsvp_cancelled: "RSVP cancelled refund",
  other: "Token adjustment",
};

export const OUTCOME_LABELS: Record<WeeklyLedgerOutcome, string> = {
  attended: "Attended",
  no_show: "No-show (penalized)",
  waitlist_released: "Waitlist released",
  cancelled: "RSVP cancelled",
  event_cancelled: "Event cancelled",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "weekly.finalize": "Event finalized",
  "weekly.save_attendance": "Attendance saved",
  "weekly.cancel_event": "Event cancelled",
  "weekly.cancel_rsvp": "RSVP cancelled by admin",
  "weekly.remind_token_auth": "Authorize reminder sent",
  "weekly.update_occurrence": "Occurrence updated",
  "weekly.rsvp_override": "RSVP window override",
  "weekly.no_show": "Marked no-show",
};

export function classifyTokenKind(input: {
  reason: string;
  description: string;
  idempotencyKey: string;
}): WeeklyLedgerTokenKind {
  const desc = input.description;
  const key = input.idempotencyKey;
  if (input.reason === "rsvp_hold") {
    return key.includes("rsvp_hold_increase_") ? "hold_increase" : "hold";
  }
  if (input.reason === "rsvp_settle_refund") return "settle_refund";
  if (input.reason === "admin_adjust") return "noshow_penalty";
  if (input.reason === "rsvp_cancel_refund") {
    if (desc.startsWith("No-show refund")) return "noshow_refund";
    if (desc.startsWith("Waitlist release")) return "waitlist_release";
    if (desc.startsWith("Event cancelled")) return "event_cancelled";
    return "rsvp_cancelled";
  }
  return "other";
}

/** Hold returned without being kept as a charge (excludes mid-event cancel/re-hold double-count). */
export function netTokensRefunded(tokensDebited: number, tokensCharged: number): number {
  return Math.max(0, tokensDebited - tokensCharged);
}

export function memberOutcome(input: {
  eventStatus: string;
  rsvpStatus: string;
  attended: boolean;
  noShow: boolean;
  kinds: WeeklyLedgerTokenKind[];
}): WeeklyLedgerOutcome {
  if (input.noShow) return "no_show";
  if (input.attended) return "attended";
  if (input.kinds.includes("waitlist_release")) return "waitlist_released";
  if (input.eventStatus === "CANCELLED" || input.kinds.includes("event_cancelled")) {
    return "event_cancelled";
  }
  if (input.rsvpStatus === "CANCELLED" || input.kinds.includes("rsvp_cancelled")) {
    return "cancelled";
  }
  if (input.rsvpStatus === "CONFIRMED") return "attended";
  if (input.rsvpStatus === "WAITLISTED") return "waitlist_released";
  return "cancelled";
}
