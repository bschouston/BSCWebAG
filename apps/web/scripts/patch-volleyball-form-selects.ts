/**
 * One-off: turn play frequency and strongest position into selects
 * on the existing volleyball registration form only.
 * Does not create the form, and does not touch events or registrations.
 *
 * Usage from apps/web:
 *   npx tsx --env-file=.env.local scripts/patch-volleyball-form-selects.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  PLAY_FREQUENCY_OPTIONS,
  STRONGEST_POSITION_OPTIONS,
  VOLLEYBALL_FORM_ID,
} from "../src/lib/registration-forms/volleyball-seed";
import type { RegistrationFormField } from "../src/lib/registration-forms/types";

const SELECTS: Record<string, readonly string[]> = {
  playFrequency: PLAY_FREQUENCY_OPTIONS,
  strongestPosition: STRONGEST_POSITION_OPTIONS,
};

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
  const ref = db.collection("registrationForms").doc(VOLLEYBALL_FORM_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`Form ${VOLLEYBALL_FORM_ID} is not in Firestore. Left it missing.`);
    return;
  }

  const fields = snap.data()?.fields;
  if (!Array.isArray(fields)) {
    throw new Error(`Form ${VOLLEYBALL_FORM_ID} has no fields array. No write performed.`);
  }

  let changed = 0;
  const next = (fields as RegistrationFormField[]).map((field) => {
    const options = SELECTS[field.id];
    if (!options) return field;
    changed += 1;
    return { ...field, type: "select" as const, options: [...options] };
  });

  if (changed !== Object.keys(SELECTS).length) {
    throw new Error(
      `Expected to update ${Object.keys(SELECTS).join(" and ")}. Updated ${changed}. No write performed.`
    );
  }

  await ref.update({ fields: next, updatedAt: Timestamp.now() });
  console.log(`Updated ${changed} fields on registrationForms/${VOLLEYBALL_FORM_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
