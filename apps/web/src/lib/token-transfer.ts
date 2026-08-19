import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";
import { isValidItsNumber, normalizeItsNumber, clubRoleNeedsIts } from "@/lib/its-number";
import { BILLING_FROZEN_MESSAGE, isBillingFrozen } from "@/lib/billing-freeze";
import { TRANSFER_DAILY_MAX, TRANSFER_MAX, TRANSFER_MIN } from "@/lib/token-transfer-limits";

export { TRANSFER_DAILY_MAX, TRANSFER_MAX, TRANSFER_MIN };

export type TransferResult =
  | { ok: true; balance: number; transferId: string; recipientUid: string }
  | { ok: false; error: string; code: string; status: number };

function startOfUtcDayMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function memberPublicName(user: Record<string, unknown>): {
  firstName: string;
  lastName: string;
  name: string;
} {
  const firstName = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const lastName = typeof user.lastName === "string" ? user.lastName.trim() : "";
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Member";
  return { firstName, lastName, name };
}

export async function sumTokensTransferredToday(adminDb: Firestore, userId: string): Promise<number> {
  const recentOut = await adminDb
    .collection("token_transactions")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  const dayStartMs = startOfUtcDayMs();
  let dayTotal = 0;
  for (const d of recentOut.docs) {
    const data = d.data();
    if (data.reason !== "transfer_out") continue;
    const created = data.createdAt as Timestamp | undefined;
    if (!created || created.toMillis() < dayStartMs) break;
    dayTotal += Number(data.amount) || 0;
  }
  return dayTotal;
}

export type RecipientLookupResult =
  | { ok: true; firstName: string; lastName: string; name: string; itsNumber: string }
  | { ok: false; error: string; code: string; status: number };

export async function lookupTransferRecipient(opts: {
  fromUid: string;
  toItsNumber: string;
}): Promise<RecipientLookupResult> {
  const its = normalizeItsNumber(opts.toItsNumber);
  if (!isValidItsNumber(its)) {
    return {
      ok: false,
      error: "Recipient ITS# must be exactly 8 digits",
      code: "BAD_ITS",
      status: 400,
    };
  }

  const adminDb = getAdminDb();
  const indexSnap = await adminDb.collection("itsIndex").doc(its).get();
  if (!indexSnap.exists) {
    return {
      ok: false,
      error: "No member found with that ITS#",
      code: "ITS_NOT_FOUND",
      status: 404,
    };
  }
  const toUid = String(indexSnap.data()?.uid ?? "");
  if (!toUid) {
    return { ok: false, error: "Invalid ITS index", code: "ITS_NOT_FOUND", status: 404 };
  }
  if (toUid === opts.fromUid) {
    return {
      ok: false,
      error: "You cannot transfer tokens to yourself",
      code: "SELF_TRANSFER",
      status: 400,
    };
  }

  const toUserSnap = await adminDb.collection("users").doc(toUid).get();
  if (!toUserSnap.exists) {
    return { ok: false, error: "Recipient account not found", code: "NOT_FOUND", status: 404 };
  }
  const toUser = toUserSnap.data() as Record<string, unknown>;
  if (!clubRoleNeedsIts(String(toUser.role ?? "MEMBER"))) {
    return {
      ok: false,
      error: "Recipient cannot receive club token transfers",
      code: "BAD_RECIPIENT",
      status: 400,
    };
  }
  if (toUser.isActive === false) {
    return {
      ok: false,
      error: "Recipient account is disabled",
      code: "RECIPIENT_DISABLED",
      status: 400,
    };
  }

  return { ok: true, itsNumber: its, ...memberPublicName(toUser) };
}

export type RecentTransferRecipient = {
  itsNumber: string;
  firstName: string;
  lastName: string;
  name: string;
};

export async function listRecentTransferRecipients(
  adminDb: Firestore,
  fromUid: string,
  limit = 8
): Promise<RecentTransferRecipient[]> {
  let unique: { its: string; toUid: string }[] = [];
  try {
    const snap = await adminDb
      .collection("tokenTransfers")
      .where("fromUid", "==", fromUid)
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();

    const seen = new Set<string>();
    for (const doc of snap.docs) {
      const data = doc.data();
      const its = normalizeItsNumber(String(data.toIts ?? ""));
      const toUid = String(data.toUid ?? "");
      if (!isValidItsNumber(its) || seen.has(its)) continue;
      seen.add(its);
      unique.push({ its, toUid });
      if (unique.length >= limit) break;
    }
  } catch (err) {
    console.error("listRecentTransferRecipients tokenTransfers query:", err);
    const txSnap = await adminDb
      .collection("token_transactions")
      .where("userId", "==", fromUid)
      .orderBy("createdAt", "desc")
      .limit(80)
      .get();
    const seen = new Set<string>();
    for (const doc of txSnap.docs) {
      const data = doc.data();
      if (data.reason !== "transfer_out") continue;
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      const its = normalizeItsNumber(String(meta.toIts ?? ""));
      const toUid = String(data.counterpartyUid ?? "");
      if (!isValidItsNumber(its) || seen.has(its)) continue;
      seen.add(its);
      unique.push({ its, toUid });
      if (unique.length >= limit) break;
    }
  }

  const out: RecentTransferRecipient[] = [];
  for (const row of unique) {
    if (!row.toUid) {
      out.push({ itsNumber: row.its, firstName: "", lastName: "", name: `ITS# ${row.its}` });
      continue;
    }
    const userSnap = await adminDb.collection("users").doc(row.toUid).get();
    const user = (userSnap.data() ?? {}) as Record<string, unknown>;
    out.push({ itsNumber: row.its, ...memberPublicName(user) });
  }
  return out;
}

export async function transferTokensByIts(opts: {
  fromUid: string;
  toItsNumber: string;
  amount: number;
}): Promise<TransferResult> {
  const amount = opts.amount;
  if (!Number.isInteger(amount) || amount < TRANSFER_MIN) {
    return {
      ok: false,
      error: `Amount must be at least ${TRANSFER_MIN} token`,
      code: "BAD_AMOUNT",
      status: 400,
    };
  }
  if (amount > TRANSFER_MAX) {
    return {
      ok: false,
      error: `Maximum ${TRANSFER_MAX} tokens per transfer`,
      code: "OVER_MAX",
      status: 400,
    };
  }

  const its = normalizeItsNumber(opts.toItsNumber);
  if (!isValidItsNumber(its)) {
    return {
      ok: false,
      error: "Recipient ITS# must be exactly 8 digits",
      code: "BAD_ITS",
      status: 400,
    };
  }

  const adminDb = getAdminDb();

  const fromSnap = await adminDb.collection("users").doc(opts.fromUid).get();
  if (!fromSnap.exists) {
    return { ok: false, error: "Sender not found", code: "NOT_FOUND", status: 404 };
  }
  if (isBillingFrozen(fromSnap.data() as Record<string, unknown>)) {
    return {
      ok: false,
      error: BILLING_FROZEN_MESSAGE,
      code: "BILLING_FROZEN",
      status: 403,
    };
  }

  const indexSnap = await adminDb.collection("itsIndex").doc(its).get();
  if (!indexSnap.exists) {
    return {
      ok: false,
      error: "No member found with that ITS#",
      code: "ITS_NOT_FOUND",
      status: 404,
    };
  }
  const toUid = String(indexSnap.data()?.uid ?? "");
  if (!toUid) {
    return { ok: false, error: "Invalid ITS index", code: "ITS_NOT_FOUND", status: 404 };
  }
  if (toUid === opts.fromUid) {
    return {
      ok: false,
      error: "You cannot transfer tokens to yourself",
      code: "SELF_TRANSFER",
      status: 400,
    };
  }

  const toUserSnap = await adminDb.collection("users").doc(toUid).get();
  if (!toUserSnap.exists) {
    return { ok: false, error: "Recipient account not found", code: "NOT_FOUND", status: 404 };
  }
  const toUser = toUserSnap.data()!;
  if (!clubRoleNeedsIts(String(toUser.role ?? "MEMBER"))) {
    return {
      ok: false,
      error: "Recipient cannot receive club token transfers",
      code: "BAD_RECIPIENT",
      status: 400,
    };
  }
  if (toUser.isActive === false) {
    return {
      ok: false,
      error: "Recipient account is disabled",
      code: "RECIPIENT_DISABLED",
      status: 400,
    };
  }

  // Daily outflow from sender (filter in memory to avoid composite index requirement)
  const dayTotal = await sumTokensTransferredToday(adminDb, opts.fromUid);
  if (dayTotal + amount > TRANSFER_DAILY_MAX) {
    return {
      ok: false,
      error: `Daily transfer limit is ${TRANSFER_DAILY_MAX} tokens (already sent ${dayTotal} today)`,
      code: "DAILY_LIMIT",
      status: 400,
    };
  }

  const transferId = adminDb.collection("tokenTransfers").doc().id;
  const fromRef = adminDb.collection("users").doc(opts.fromUid);
  const toRef = adminDb.collection("users").doc(toUid);

  try {
    const balance = await adminDb.runTransaction(async (t) => {
      const [fromSnap, toSnap] = await Promise.all([t.get(fromRef), t.get(toRef)]);
      if (!fromSnap.exists) throw new Error("SENDER_NOT_FOUND");
      if (!toSnap.exists) throw new Error("RECIPIENT_NOT_FOUND");
      const from = fromSnap.data()!;
      const to = toSnap.data()!;
      if (from.isActive === false) throw new Error("SENDER_DISABLED");
      if (isBillingFrozen(from as Record<string, unknown>)) throw new Error("BILLING_FROZEN");
      const fromBal = typeof from.tokenBalance === "number" ? from.tokenBalance : 0;
      const toBal = typeof to.tokenBalance === "number" ? to.tokenBalance : 0;
      if (fromBal < amount) throw new Error("INSUFFICIENT");

      const fromIts =
        typeof from.itsNumber === "string" ? from.itsNumber : null;
      const toIts = typeof to.itsNumber === "string" ? to.itsNumber : its;

      const afterDebit = await applyTokenLedgerInTransaction(t, adminDb, {
        userId: opts.fromUid,
        userRef: fromRef,
        currentBalance: fromBal,
        type: "DEBIT",
        amount,
        reason: "transfer_out",
        description: `Transfer to ITS# ${toIts}`,
        idempotencyKey: `transfer_out_${transferId}`,
        counterpartyUid: toUid,
        transferId,
        meta: { toIts, fromIts },
      });

      await applyTokenLedgerInTransaction(t, adminDb, {
        userId: toUid,
        userRef: toRef,
        currentBalance: toBal,
        type: "CREDIT",
        amount,
        reason: "transfer_in",
        description: `Transfer from ITS# ${fromIts ?? "unknown"}`,
        idempotencyKey: `transfer_in_${transferId}`,
        counterpartyUid: opts.fromUid,
        transferId,
        meta: { toIts, fromIts },
      });

      t.set(adminDb.collection("tokenTransfers").doc(transferId), {
        id: transferId,
        fromUid: opts.fromUid,
        toUid,
        amount,
        toIts,
        fromIts,
        createdAt: Timestamp.now(),
      });

      return afterDebit.balance;
    });

    return { ok: true, balance, transferId, recipientUid: toUid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "INSUFFICIENT") {
      return {
        ok: false,
        error: "Insufficient token balance",
        code: "INSUFFICIENT",
        status: 402,
      };
    }
    if (msg === "SENDER_DISABLED") {
      return {
        ok: false,
        error: "Your account is disabled",
        code: "DISABLED",
        status: 403,
      };
    }
    if (msg === "BILLING_FROZEN") {
      return {
        ok: false,
        error: BILLING_FROZEN_MESSAGE,
        code: "BILLING_FROZEN",
        status: 403,
      };
    }
    console.error("transferTokensByIts error:", err);
    return {
      ok: false,
      error: "Transfer failed",
      code: "ERROR",
      status: 500,
    };
  }
}
