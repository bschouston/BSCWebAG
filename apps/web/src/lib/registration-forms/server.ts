import { getAdminDb } from "@/lib/firebase/admin";
import type { RegistrationFormDoc } from "./types";

export function registrationFormsRef() {
  return getAdminDb().collection("registrationForms");
}

function serializeForm(id: string, data: Record<string, any>): RegistrationFormDoc {
  return {
    id,
    name: String(data.name ?? ""),
    description: data.description ?? "",
    status: data.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    sections: Array.isArray(data.sections) ? data.sections : [],
    fields: Array.isArray(data.fields) ? data.fields : [],
    duplicatedFrom: data.duplicatedFrom ?? null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? undefined,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.updatedAt ?? undefined,
    updatedBy: data.updatedBy ?? null,
  };
}

export async function listRegistrationForms(): Promise<RegistrationFormDoc[]> {
  const snap = await registrationFormsRef().orderBy("name", "asc").get();
  return snap.docs.map((d) => serializeForm(d.id, d.data()));
}

export type RegistrationFormUsageEvent = {
  id: string;
  title: string;
  status: string;
};

/** Events that still point at this template via registrationFormId. */
export async function listEventsUsingRegistrationForm(
  formId: string
): Promise<RegistrationFormUsageEvent[]> {
  const snap = await getAdminDb()
    .collection("events")
    .where("registrationFormId", "==", formId)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data();
      const title = typeof data.title === "string" ? data.title.trim() : "";
      return {
        id: doc.id,
        title: title || "Untitled event",
        status: typeof data.status === "string" ? data.status : "",
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getRegistrationForm(formId: string): Promise<RegistrationFormDoc | null> {
  const doc = await registrationFormsRef().doc(formId).get();
  if (!doc.exists) return null;
  return serializeForm(doc.id, doc.data()!);
}
