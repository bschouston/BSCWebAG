import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 4-digit tracker passcode hashing. The passcode is never stored in plain
 * text; only a salted scrypt hash lives in Firestore (in a private doc that
 * clients cannot read), and verification happens exclusively server-side.
 */

export function isValidPasscodeFormat(passcode: unknown): passcode is string {
  return typeof passcode === "string" && /^\d{4}$/.test(passcode);
}

export function hashPasscode(passcode: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(passcode, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPasscodeHash(passcode: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(passcode, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
