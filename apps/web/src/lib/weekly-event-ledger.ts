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
  /** Sum of per-member latest-generation holds. Collected = Held − Refunded. */
  tokensHeld: number;
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

export type WeeklyLedgerTxInput = {
  type: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  description: string;
  idempotencyKey: string;
};

/** Parse `_g{N}` from RSVP hold/cancel idempotency keys. Missing/legacy → 0. */
export function holdGenerationFromKey(idempotencyKey: string): number {
  const match = /_g(\d+)\b/.exec(idempotencyKey);
  return match ? Number(match[1]) || 0 : 0;
}

/**
 * Member ledger columns for one RSVP.
 * Cancel/re-RSVP loops must not inflate Held / Net refunded (latest hold generation only).
 * Charged = net tokens the club kept across all txs.
 */
export function memberTokenTotals(
  txs: WeeklyLedgerTxInput[],
  fallbackHeld = 0
): { tokensHeld: number; tokensCharged: number; tokensRefunded: number } {
  const debited = txs
    .filter((tx) => tx.type === "DEBIT")
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const credited = txs
    .filter((tx) => tx.type === "CREDIT")
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const tokensCharged = Math.max(0, debited - credited);

  const holdDebits = txs.filter((tx) => {
    if (tx.type !== "DEBIT") return false;
    const kind = classifyTokenKind({
      reason: tx.reason,
      description: tx.description,
      idempotencyKey: tx.idempotencyKey,
    });
    return kind === "hold" || kind === "hold_increase" || kind === "noshow_penalty";
  });

  let tokensHeld = fallbackHeld;
  if (holdDebits.length > 0) {
    let latestGen = -1;
    for (const tx of holdDebits) {
      latestGen = Math.max(latestGen, holdGenerationFromKey(tx.idempotencyKey));
    }
    tokensHeld = holdDebits
      .filter((tx) => holdGenerationFromKey(tx.idempotencyKey) === latestGen)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }

  const tokensRefunded = Math.max(0, tokensHeld - tokensCharged);
  return { tokensHeld, tokensCharged, tokensRefunded };
}

/** @deprecated Prefer memberTokenTotals — kept for any stray imports. */
export function netTokensRefunded(tokensHeld: number, tokensCharged: number): number {
  return Math.max(0, tokensHeld - tokensCharged);
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
