/**
 * Save the built-in registration field types, including optional sublabels
 * and examples. Does not change forms, events, or registrations.
 * If the catalog already exists, it is left unchanged.
 *
 * Usage from apps/web:
 *   npx tsx --env-file=.env.local scripts/patch-field-type-catalog.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_FIELD_TYPES } from "../src/lib/registration-forms/field-types";

function getDb() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials in env");
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return getFirestore();
}

async function main() {
  const db = getDb();
  const ref = db.collection("registrationFieldTypes").doc("catalog");
  const snap = await ref.get();
  if (snap.exists) {
    console.log("registrationFieldTypes/catalog already exists. Left it unchanged.");
    return;
  }
  await ref.set({ types: DEFAULT_FIELD_TYPES });
  console.log(`Saved ${DEFAULT_FIELD_TYPES.length} field types.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
