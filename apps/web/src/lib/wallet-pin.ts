import "server-only";
import { createHash, randomInt } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendWalletPinEmail } from "@/lib/email";

export type WalletPinPurpose = "transfer" | "prefs" | "card";

const PIN_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function challengeDocId(uid: string, purpose: WalletPinPurpose) {
  return `${uid}_${purpose}`;
}

function hashPin(uid: string, purpose: WalletPinPurpose, pin: string): string {
  return createHash("sha256")
    .update(`${uid}:${purpose}:${pin}`)
    .digest("hex");
}

function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Create a 6-digit PIN, email it, store hash (Admin SDK only). */
export async function issueWalletPin(opts: {
  uid: string;
  email: string;
  name: string;
  purpose: WalletPinPurpose;
}): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const pin = generatePin();
  const adminDb = getAdminDb();
  const ref = adminDb.collection("walletPinChallenges").doc(
    challengeDocId(opts.uid, opts.purpose)
  );
  const expiresAt = Timestamp.fromMillis(Date.now() + PIN_TTL_MS);

  await ref.set({
    uid: opts.uid,
    purpose: opts.purpose,
    pinHash: hashPin(opts.uid, opts.purpose, pin),
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  const purposeLabel =
    opts.purpose === "transfer"
      ? "token transfer"
      : opts.purpose === "prefs"
        ? "wallet auto replenish settings"
        : "payment card change";

  try {
    await sendWalletPinEmail({
      to: opts.email,
      name: opts.name,
      pin,
      purposeLabel,
      expiresMinutes: 10,
    });
  } catch (err) {
    console.error("sendWalletPinEmail failed:", err);
    await ref.delete().catch(() => undefined);
    return { ok: false, error: "Failed to send PIN email" };
  }

  return { ok: true, expiresAt: expiresAt.toDate().toISOString() };
}

/**
 * Verify PIN for purpose. On success, consume the challenge (one-time).
 * Returns error codes for UI.
 */
export async function consumeWalletPin(opts: {
  uid: string;
  purpose: WalletPinPurpose;
  pin: string;
}): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const pin = String(opts.pin ?? "").replace(/\D/g, "");
  if (pin.length !== 6) {
    return { ok: false, error: "Enter the 6-digit PIN from your email", code: "BAD_PIN" };
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("walletPinChallenges").doc(
    challengeDocId(opts.uid, opts.purpose)
  );

  try {
    await adminDb.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new Error("NO_CHALLENGE");
      const data = snap.data()!;
      const expiresAt = data.expiresAt as Timestamp | undefined;
      if (!expiresAt || expiresAt.toMillis() < Date.now()) {
        t.delete(ref);
        throw new Error("EXPIRED");
      }
      const attempts = typeof data.attempts === "number" ? data.attempts : 0;
      if (attempts >= MAX_ATTEMPTS) {
        t.delete(ref);
        throw new Error("LOCKED");
      }
      const expected = hashPin(opts.uid, opts.purpose, pin);
      if (data.pinHash !== expected) {
        t.update(ref, { attempts: attempts + 1 });
        throw new Error("MISMATCH");
      }
      t.delete(ref);
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "NO_CHALLENGE") {
      return {
        ok: false,
        error: "Request a PIN first",
        code: "NO_CHALLENGE",
      };
    }
    if (msg === "EXPIRED") {
      return { ok: false, error: "PIN expired. Request a new one.", code: "EXPIRED" };
    }
    if (msg === "LOCKED") {
      return {
        ok: false,
        error: "Too many incorrect attempts. Request a new PIN.",
        code: "LOCKED",
      };
    }
    if (msg === "MISMATCH") {
      return { ok: false, error: "Incorrect PIN", code: "MISMATCH" };
    }
    console.error("consumeWalletPin error:", err);
    return { ok: false, error: "PIN verification failed", code: "ERROR" };
  }
}
