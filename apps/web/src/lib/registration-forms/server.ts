import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { RegistrationFormDoc } from "./types";
import { volleyballRegistrationFormSeed, VOLLEYBALL_FORM_ID } from "./volleyball-seed";

export function registrationFormsRef() {
  return getAdminDb().collection("registrationForms");
}

function serializeForm(id: string, data: Record<string, any>): RegistrationFormDoc {
  return {
    id,
    name: String(data.name ?? ""),
    slug: String(data.slug ?? id),
    description: data.description ?? "",
    status: data.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    isSystem: data.isSystem === true,
    syncToGoogleSheet: data.syncToGoogleSheet === true,
    sections: Array.isArray(data.sections) ? data.sections : [],
    fields: Array.isArray(data.fields) ? data.fields : [],
    duplicatedFrom: data.duplicatedFrom ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? undefined,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? undefined,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Ensure the system volleyball form exists; return all forms. */
export async function listRegistrationFormsEnsuringSeed(): Promise<RegistrationFormDoc[]> {
  const col = registrationFormsRef();
  const volleyball = await col.doc(VOLLEYBALL_FORM_ID).get();
  if (!volleyball.exists) {
    const now = new Date().toISOString();
    const seed = volleyballRegistrationFormSeed(now);
    const { id, ...rest } = seed;
    await col.doc(id).set({
      ...rest,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  const snap = await col.orderBy("name", "asc").get();
  return snap.docs.map((d) => serializeForm(d.id, d.data()));
}

export async function getRegistrationForm(formId: string): Promise<RegistrationFormDoc | null> {
  await listRegistrationFormsEnsuringSeed();
  const doc = await registrationFormsRef().doc(formId).get();
  if (!doc.exists) return null;
  return serializeForm(doc.id, doc.data()!);
}
