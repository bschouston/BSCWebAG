/**
 * Copy the current participation and waiver paragraphs onto the volleyball
 * and Soccer Registration forms. Does not create forms, and does not touch
 * events or registrations. Field ids stay the same.
 *
 * Skips a signature field that already has agreement text.
 *
 * Usage from apps/web:
 *   npx tsx --env-file=.env.local scripts/patch-signature-agreement-text.ts
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  PARTICIPATION_AGREEMENT_BODY,
  PARTICIPATION_AGREEMENT_TITLE,
  WAIVER_BODY,
  WAIVER_TITLE,
} from "../src/lib/registration-forms/legal-agreements";
import { VOLLEYBALL_FORM_ID } from "../src/lib/registration-forms/volleyball-seed";
import type { RegistrationFormField } from "../src/lib/registration-forms/types";

const SIGNATURES: Record<string, { text: string; volleyballLabel: string }> = {
  participationAgreementSignature: {
    text: PARTICIPATION_AGREEMENT_BODY,
    volleyballLabel: PARTICIPATION_AGREEMENT_TITLE,
  },
  waiverSignature: {
    text: WAIVER_BODY,
    volleyballLabel: WAIVER_TITLE,
  },
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

function patchFields(
  fields: RegistrationFormField[],
  formLabel: string,
  setLabels: boolean
): { next: RegistrationFormField[]; changed: number } {
  const ids = new Set(fields.map((field) => field.id));
  const missing = Object.keys(SIGNATURES).filter((id) => !ids.has(id));
  if (missing.length) {
    throw new Error(
      `${formLabel} is missing signature field(s): ${missing.join(", ")}. No write performed.`
    );
  }

  let changed = 0;
  const next = fields.map((field) => {
    const spec = SIGNATURES[field.id];
    if (!spec) return field;
    if (typeof field.agreementText === "string" && field.agreementText.trim()) return field;
    changed += 1;
    return {
      ...field,
      agreementText: spec.text,
      ...(setLabels ? { label: spec.volleyballLabel } : {}),
    };
  });
  return { next, changed };
}

async function main() {
  const db = getDb();
  const forms = db.collection("registrationForms");

  const volleyballRef = forms.doc(VOLLEYBALL_FORM_ID);
  const volleyballSnap = await volleyballRef.get();
  if (!volleyballSnap.exists) {
    throw new Error(`Form ${VOLLEYBALL_FORM_ID} is not in Firestore. No write performed.`);
  }

  const all = await forms.get();
  const soccerDocs = all.docs.filter((doc) =>
    /^soccer registration\b/i.test(String(doc.data().name ?? "").trim())
  );
  if (soccerDocs.length !== 1) {
    const known = all.docs.map((doc) => `${doc.id}: ${String(doc.data().name ?? "")}`).join("; ");
    throw new Error(
      `Expected one Soccer Registration form, found ${soccerDocs.length}. No write performed. Forms: ${known}`
    );
  }

  const volleyballFields = volleyballSnap.data()?.fields;
  if (!Array.isArray(volleyballFields)) {
    throw new Error(`Form ${VOLLEYBALL_FORM_ID} has no fields array. No write performed.`);
  }
  const volleyballPatch = patchFields(
    volleyballFields as RegistrationFormField[],
    VOLLEYBALL_FORM_ID,
    true
  );

  const soccerPatches = soccerDocs.map((doc) => {
    const fields = doc.data().fields;
    if (!Array.isArray(fields)) {
      throw new Error(`Form ${doc.id} has no fields array. No write performed.`);
    }
    return {
      ref: doc.ref as DocumentReference,
      id: doc.id,
      ...patchFields(fields as RegistrationFormField[], doc.id, false),
    };
  });

  const writes: { ref: DocumentReference; fields: RegistrationFormField[]; label: string; changed: number }[] =
    [
      {
        ref: volleyballRef,
        fields: volleyballPatch.next,
        label: VOLLEYBALL_FORM_ID,
        changed: volleyballPatch.changed,
      },
      ...soccerPatches.map((patch) => ({
        ref: patch.ref,
        fields: patch.next,
        label: patch.id,
        changed: patch.changed,
      })),
    ];

  for (const write of writes) {
    if (!write.changed) {
      console.log(`${write.label}: agreement text already set. Left it unchanged.`);
      continue;
    }
    await write.ref.update({ fields: write.fields, updatedAt: Timestamp.now() });
    console.log(`${write.label}: saved agreement text on ${write.changed} signature field(s).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
