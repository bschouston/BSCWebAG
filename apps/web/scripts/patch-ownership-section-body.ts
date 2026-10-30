/**
 * Copy the current Team Ownership paragraphs onto each form that has an
 * ownership section or the interestedInTeamOwnership field. Removes that
 * checkbox field. Does not create forms, and does not touch events or
 * registrations.
 *
 * Skips a section that already has body text. A second run leaves that body
 * unchanged and does not delete other fields.
 *
 * Usage from apps/web:
 *   npx tsx --env-file=.env.local scripts/patch-ownership-section-body.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { teamOwnershipSectionBody } from "../src/lib/registration-forms/team-ownership-copy";
import type { RegistrationFormField, RegistrationFormSection } from "../src/lib/registration-forms/types";

const OWNERSHIP_FIELD_ID = "interestedInTeamOwnership";

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

function patchForm(data: DocumentData): {
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
  wroteBody: number;
  removedField: boolean;
} | null {
  const sections = data.sections;
  const fields = data.fields;
  if (!Array.isArray(sections) || !Array.isArray(fields)) return null;

  const typedFields = fields as RegistrationFormField[];
  const ownershipField = typedFields.find((field) => field.id === OWNERSHIP_FIELD_ID);
  const sectionIds = new Set<string>();
  for (const section of sections as RegistrationFormSection[]) {
    if (section.id === "ownership") sectionIds.add(section.id);
  }
  if (ownershipField?.sectionId) sectionIds.add(ownershipField.sectionId);
  if (sectionIds.size === 0) return null;

  let wroteBody = 0;
  const nextSections = (sections as RegistrationFormSection[]).map((section) => {
    if (!sectionIds.has(section.id)) return section;
    if (typeof section.body === "string" && section.body.trim()) return section;
    wroteBody += 1;
    return { ...section, body: teamOwnershipSectionBody() };
  });
  const removedField = typedFields.some((field) => field.id === OWNERSHIP_FIELD_ID);
  const nextFields = typedFields.filter((field) => field.id !== OWNERSHIP_FIELD_ID);
  if (!wroteBody && !removedField) return null;
  return { sections: nextSections, fields: nextFields, wroteBody, removedField };
}

async function main() {
  const db = getDb();
  const forms = await db.collection("registrationForms").get();
  let updated = 0;

  for (const doc of forms.docs) {
    const name = String(doc.data().name ?? "");
    const patch = patchForm(doc.data());
    if (!patch) {
      console.log(`${doc.id} (${name}): left unchanged.`);
      continue;
    }
    await doc.ref.update({
      sections: patch.sections,
      fields: patch.fields,
      updatedAt: Timestamp.now(),
    });
    updated += 1;
    const parts = [
      patch.wroteBody ? `saved section text on ${patch.wroteBody} section(s)` : "section text already set",
      patch.removedField ? "removed interestedInTeamOwnership" : "checkbox already absent",
    ];
    console.log(`${doc.id} (${name}): ${parts.join("; ")}.`);
  }

  console.log(`Updated ${updated} form(s). Registrations were not changed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
