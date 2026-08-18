import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export type TokenLedgerReason =
  | "purchase"
  | "auto_replenish"
  | "unit_purchase"
  | "package_purchase"
  | "rsvp_hold"
  | "rsvp_settle_refund"
  | "rsvp_cancel_refund"
  | "transfer_in"
  | "transfer_out"
  | "admin_adjust"
  /** @deprecated legacy RSVP debit before escrow model */
  | "rsvp";

export type TokenLedgerEntryInput = {
  userId: string;
  userRef: DocumentReference;
  /** Current balance already read in this transaction */
  currentBalance: number;
  type: "CREDIT" | "DEBIT";
  /** Positive whole tokens */
  amount: number;
  reason: TokenLedgerReason;
  description: string;
  /** Unique; used as the Firestore doc id for idempotency */
  idempotencyKey: string;
  eventId?: string | null;
  rsvpId?: string | null;
  counterpartyUid?: string | null;
  stripePaymentIntentId?: string | null;
  transferId?: string | null;
  adminUid?: string | null;
  meta?: Record<string, unknown>;
};

export type TokenLedgerApplyResult = {
  balance: number;
  /** True if this idempotency key was already applied */
  replayed: boolean;
};

function assertWholePositive(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
}

/**
 * Apply a token credit/debit inside an existing Admin SDK transaction.
 * Idempotent: if `idempotencyKey` doc already exists, returns prior balanceAfter and does nothing.
 */
export async function applyTokenLedgerInTransaction(
  t: Transaction,
  adminDb: Firestore,
  input: TokenLedgerEntryInput
): Promise<TokenLedgerApplyResult> {
  assertWholePositive(input.amount);

  const txRef = adminDb.collection("token_transactions").doc(input.idempotencyKey);
  const existing = await t.get(txRef);
  if (existing.exists) {
    const prior = existing.data()?.balanceAfter;
    return {
      balance: typeof prior === "number" ? prior : input.currentBalance,
      replayed: true,
    };
  }

  const delta = input.type === "CREDIT" ? input.amount : -input.amount;
  const next = input.currentBalance + delta;
  if (next < 0) throw new Error("NEGATIVE_BALANCE");

  const now = Timestamp.now();
  t.update(input.userRef, {
    tokenBalance: next,
    updatedAt: FieldValue.serverTimestamp(),
  });
  t.set(txRef, {
    id: input.idempotencyKey,
    userId: input.userId,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    eventId: input.eventId ?? null,
    rsvpId: input.rsvpId ?? null,
    counterpartyUid: input.counterpartyUid ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    transferId: input.transferId ?? null,
    adminUid: input.adminUid ?? null,
    meta: input.meta ?? {},
    balanceBefore: input.currentBalance,
    balanceAfter: next,
    createdAt: now,
  });

  return { balance: next, replayed: false };
}

/** Standalone credit/debit (own transaction). */
export async function applyTokenLedgerChange(
  adminDb: Firestore,
  input: Omit<TokenLedgerEntryInput, "userRef" | "currentBalance"> & {
    userRef?: DocumentReference;
  }
): Promise<TokenLedgerApplyResult> {
  const userRef = input.userRef ?? adminDb.collection("users").doc(input.userId);
  return adminDb.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const currentBalance =
      typeof snap.data()?.tokenBalance === "number" ? snap.data()!.tokenBalance : 0;
    return applyTokenLedgerInTransaction(t, adminDb, {
      ...input,
      userRef,
      currentBalance,
    });
  });
}
