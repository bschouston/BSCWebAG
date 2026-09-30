/**
 * Inspect North American Cup event fees + form binding.
 *   npx tsx --env-file=.env.local scripts/inspect-cup-registration-fees.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  registrationFeeAmount,
  resolveEffectiveRegistrationFee,
} from "../src/lib/registration-fee";

function getDb() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials");
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return getFirestore();
}

function matchesCup(title: string, slug: string): boolean {
  const t = title.toLowerCase();
  const s = slug.toLowerCase();
  return (
    t.includes("north american") ||
    t.includes("north america") ||
    (t.includes("soccer") && t.includes("cup")) ||
    s.includes("north-american") ||
    s.includes("na-cup") ||
    s.includes("nac")
  );
}

async function main() {
  const db = getDb();
  const snap = await db.collection("events").get();
  const candidates = snap.docs.filter((d) => {
    const data = d.data();
    return matchesCup(String(data.title ?? ""), String(data.slug ?? ""));
  });

  if (candidates.length === 0) {
    console.log("No Cup-like events found. Listing recent tournament-ish titles:");
    for (const d of snap.docs.slice(0, 40)) {
      const data = d.data();
      console.log(`- ${d.id} | ${data.title} | form=${data.registrationFormId ?? "—"} | fees=${(data.registrationFees ?? []).length}`);
    }
    return;
  }

  for (const d of candidates) {
    const data = d.data();
    const fees = (data.registrationFees ?? []) as Array<Record<string, unknown>>;
    const resolved = resolveEffectiveRegistrationFee(fees as any);
    const amount = registrationFeeAmount(fees as any);
    console.log("\n=== EVENT ===");
    console.log("id:", d.id);
    console.log("title:", data.title);
    console.log("slug:", data.slug);
    console.log("registrationFormId:", data.registrationFormId);
    console.log("registrationFormType:", data.registrationFormType);
    console.log("fees raw:", JSON.stringify(fees, null, 2));
    console.log("resolved fee:", resolved);
    console.log("registrationFeeAmount:", amount);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
