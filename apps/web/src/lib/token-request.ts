import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";

export const TOKEN_REQUESTS_COLLECTION = "tokenRequests";

export const TOKEN_REQUEST_PENDING_MESSAGE =
  "A Super Admin token request must be paid before you can use tokens. Open My Wallet to pay.";

export type TokenRequestStatus = "pending" | "paid" | "cancelled";

export type TokenRequestRecord = {
  id: string;
  memberUid: string;
  adminUid: string;
  amount: number;
  reason: string;
  status: TokenRequestStatus;
  createdAt: string | null;
  resolvedAt: string | null;
};

function toIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function serializeTokenRequest(
  id: string,
  data: Record<string, unknown>
): TokenRequestRecord {
  const status = data.status;
  return {
    id,
    memberUid: typeof data.memberUid === "string" ? data.memberUid : "",
    adminUid: typeof data.adminUid === "string" ? data.adminUid : "",
    amount: Number(data.amount) || 0,
    reason: typeof data.reason === "string" ? data.reason : "",
    status: status === "paid" || status === "cancelled" ? status : "pending",
    createdAt: toIso(data.createdAt),
    resolvedAt: toIso(data.resolvedAt),
  };
}

export async function getPendingTokenRequest(
  db: Firestore,
  uid: string
): Promise<TokenRequestRecord | null> {
  const userSnap = await db.collection("users").doc(uid).get();
  const pendingId =
    typeof userSnap.data()?.pendingTokenRequestId === "string"
      ? userSnap.data()!.pendingTokenRequestId
      : "";
  if (pendingId) {
    const snap = await db.collection(TOKEN_REQUESTS_COLLECTION).doc(pendingId).get();
    if (snap.exists) {
      const rec = serializeTokenRequest(snap.id, snap.data() ?? {});
      if (rec.status === "pending" && rec.memberUid === uid) return rec;
    }
  }
  const q = await db
    .collection(TOKEN_REQUESTS_COLLECTION)
    .where("memberUid", "==", uid)
    .where("status", "==", "pending")
    .limit(1)
    .get()
    .catch(() => null);
  if (!q || q.empty) return null;
  const doc = q.docs[0]!;
  return serializeTokenRequest(doc.id, doc.data());
}

export async function pendingTokenRequestResponse(db: Firestore, uid: string) {
  const pending = await getPendingTokenRequest(db, uid);
  if (!pending) return null;
  return {
    error: TOKEN_REQUEST_PENDING_MESSAGE,
    code: "TOKEN_REQUEST_PENDING" as const,
    pendingTokenRequest: pending,
  };
}

export async function payPendingTokenRequest(opts: {
  db: Firestore;
  uid: string;
  requestId: string;
}): Promise<{ balance: number; replayed: boolean; request: TokenRequestRecord }> {
  const { db, uid, requestId } = opts;
  return db.runTransaction(async (t) => {
    const requestRef = db.collection(TOKEN_REQUESTS_COLLECTION).doc(requestId);
    const userRef = db.collection("users").doc(uid);
    const [requestSnap, userSnap] = await Promise.all([t.get(requestRef), t.get(userRef)]);
    if (!requestSnap.exists) throw new Error("NOT_FOUND");
    const request = serializeTokenRequest(requestSnap.id, requestSnap.data() ?? {});
    if (request.memberUid !== uid) throw new Error("FORBIDDEN");
    if (request.status === "paid") {
      const balance =
        typeof userSnap.data()?.tokenBalance === "number" ? userSnap.data()!.tokenBalance : 0;
      return { balance, replayed: true, request };
    }
    if (request.status !== "pending") throw new Error("NOT_PENDING");
    const currentBalance =
      typeof userSnap.data()?.tokenBalance === "number" ? userSnap.data()!.tokenBalance : 0;
    if (currentBalance < request.amount) throw new Error("INSUFFICIENT_TOKENS");

    const ledger = await applyTokenLedgerInTransaction(t, db, {
      userId: uid,
      userRef,
      currentBalance,
      type: "DEBIT",
      amount: request.amount,
      reason: "token_request",
      description: `Token request: ${request.reason}`,
      idempotencyKey: `token_request_pay_${requestId}`,
      meta: { requestId, adminUid: request.adminUid, reason: request.reason },
    });
    t.update(requestRef, {
      status: "paid",
      resolvedAt: FieldValue.serverTimestamp(),
      paidLedgerKey: `token_request_pay_${requestId}`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(userRef, {
      pendingTokenRequestId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      balance: ledger.balance,
      replayed: ledger.replayed,
      request: { ...request, status: "paid" as const },
    };
  });
}
