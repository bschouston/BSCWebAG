import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { isValidItsNumber, normalizeItsNumber } from "@/lib/its-number";

export type ItsClaimResult =
  | { ok: true; itsNumber: string }
  | { ok: false; status: number; error: string };

/** Claim ITS# for uid. Fails if user already has one or ITS# is taken. */
export async function claimItsNumber(uid: string, raw: string): Promise<ItsClaimResult> {
  const itsNumber = normalizeItsNumber(raw);
  if (!isValidItsNumber(itsNumber)) {
    return { ok: false, status: 400, error: "ITS# must be exactly 8 digits" };
  }

  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const indexRef = adminDb.collection("itsIndex").doc(itsNumber);

  try {
    await adminDb.runTransaction(async (t) => {
      const [userSnap, indexSnap] = await Promise.all([t.get(userRef), t.get(indexRef)]);
      if (!userSnap.exists) throw new Error("NOT_FOUND");
      const existing = userSnap.data()?.itsNumber;
      if (typeof existing === "string" && existing.length > 0) {
        throw new Error("ALREADY_SET");
      }
      if (indexSnap.exists) {
        const owner = indexSnap.data()?.uid;
        if (owner && owner !== uid) throw new Error("TAKEN");
      }
      t.set(indexRef, {
        uid,
        claimedAt: Timestamp.now(),
      });
      t.update(userRef, {
        itsNumber,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, itsNumber };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return { ok: false, status: 404, error: "User not found" };
    if (msg === "ALREADY_SET") return { ok: false, status: 409, error: "ITS# already set on this account" };
    if (msg === "TAKEN") return { ok: false, status: 409, error: "This ITS# is already registered" };
    console.error("claimItsNumber error:", err);
    return { ok: false, status: 500, error: "Internal Server Error" };
  }
}

/** Clear ITS# from user and delete index (Super Admin). */
export async function releaseItsNumber(uid: string): Promise<ItsClaimResult> {
  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);

  try {
    const released = await adminDb.runTransaction(async (t) => {
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) throw new Error("NOT_FOUND");
      const itsNumber = userSnap.data()?.itsNumber;
      if (typeof itsNumber !== "string" || !itsNumber) {
        throw new Error("NONE");
      }
      const indexRef = adminDb.collection("itsIndex").doc(itsNumber);
      const indexSnap = await t.get(indexRef);
      if (indexSnap.exists && indexSnap.data()?.uid === uid) {
        t.delete(indexRef);
      }
      t.update(userRef, {
        itsNumber: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return itsNumber;
    });
    return { ok: true, itsNumber: released };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return { ok: false, status: 404, error: "User not found" };
    if (msg === "NONE") return { ok: false, status: 400, error: "Account has no ITS#" };
    console.error("releaseItsNumber error:", err);
    return { ok: false, status: 500, error: "Internal Server Error" };
  }
}

/** Release current ITS# (if any) and claim a new one in one transaction. */
export async function reassignItsNumber(uid: string, raw: string): Promise<ItsClaimResult> {
  const itsNumber = normalizeItsNumber(raw);
  if (!isValidItsNumber(itsNumber)) {
    return { ok: false, status: 400, error: "ITS# must be exactly 8 digits" };
  }

  const adminDb = getAdminDb();
  const userRef = adminDb.collection("users").doc(uid);
  const newIndexRef = adminDb.collection("itsIndex").doc(itsNumber);

  try {
    await adminDb.runTransaction(async (t) => {
      const [userSnap, newIndexSnap] = await Promise.all([t.get(userRef), t.get(newIndexRef)]);
      if (!userSnap.exists) throw new Error("NOT_FOUND");
      const oldIts = userSnap.data()?.itsNumber;
      if (typeof oldIts === "string" && oldIts === itsNumber) {
        return;
      }
      if (newIndexSnap.exists) {
        const owner = newIndexSnap.data()?.uid;
        if (owner && owner !== uid) throw new Error("TAKEN");
      }
      if (typeof oldIts === "string" && oldIts) {
        const oldIndexRef = adminDb.collection("itsIndex").doc(oldIts);
        const oldSnap = await t.get(oldIndexRef);
        if (oldSnap.exists && oldSnap.data()?.uid === uid) {
          t.delete(oldIndexRef);
        }
      }
      t.set(newIndexRef, { uid, claimedAt: Timestamp.now() });
      t.update(userRef, {
        itsNumber,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, itsNumber };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NOT_FOUND") return { ok: false, status: 404, error: "User not found" };
    if (msg === "TAKEN") return { ok: false, status: 409, error: "This ITS# is already registered" };
    console.error("reassignItsNumber error:", err);
    return { ok: false, status: 500, error: "Internal Server Error" };
  }
}
