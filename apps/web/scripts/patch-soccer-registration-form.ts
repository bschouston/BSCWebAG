/**
 * One-off: patch the "Soccer Registration" form in Firestore.
 * Usage from apps/web:
 *   npx tsx --env-file=.env.local scripts/patch-soccer-registration-form.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { applySoccerRegistrationFields } from "../src/lib/registration-forms/apply-soccer-fields";
import type {
  RegistrationFormField,
  RegistrationFormSection,
} from "../src/lib/registration-forms/types";

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
  const snap = await db.collection("registrationForms").get();
  const matches = snap.docs.filter((d) => {
    const data = d.data();
    const name = String(data.name ?? "").toLowerCase();
    const slug = String(data.slug ?? "").toLowerCase();
    return (
      name === "soccer registration" ||
      slug.includes("soccer") ||
      (name.includes("soccer") && (slug.includes("copy") || slug.includes("volleyball")))
    );
  });

  if (!matches.length) {
    console.error(
      "No Soccer Registration form found. Docs:",
      snap.docs.map((d) => ({ id: d.id, name: d.data().name, slug: d.data().slug }))
    );
    process.exit(1);
  }

  for (const doc of matches) {
    const data = doc.data();
    const { sections, fields } = applySoccerRegistrationFields(
      (data.sections ?? []) as RegistrationFormSection[],
      (data.fields ?? []) as RegistrationFormField[]
    );
    await doc.ref.update({
      name: "Soccer Registration",
      sections,
      fields,
      syncToGoogleSheet: false,
      updatedAt: Timestamp.now(),
    });
    console.log(`Patched form ${doc.id} (${data.name} / ${data.slug}) → ${fields.length} fields`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
