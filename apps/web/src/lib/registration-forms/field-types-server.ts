import { getAdminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_FIELD_TYPES,
  readFieldTypeDefinition,
  type FieldTypeDefinition,
} from "./field-types";
import { listRegistrationForms } from "./server";

export const FIELD_TYPE_CATALOG_COLLECTION = "registrationFieldTypes";
export const FIELD_TYPE_CATALOG_DOC = "catalog";

export function fieldTypeCatalogRef() {
  return getAdminDb().collection(FIELD_TYPE_CATALOG_COLLECTION).doc(FIELD_TYPE_CATALOG_DOC);
}

/** Stored catalog, or the built-in list when the document does not exist yet. */
export async function getFieldTypeCatalog(): Promise<{
  types: FieldTypeDefinition[];
  stored: boolean;
}> {
  const snap = await fieldTypeCatalogRef().get();
  if (!snap.exists) return { types: DEFAULT_FIELD_TYPES, stored: false };
  const raw = snap.data()?.types;
  const types = Array.isArray(raw)
    ? raw.map(readFieldTypeDefinition).filter((type): type is FieldTypeDefinition => !!type)
    : [];
  return { types, stored: true };
}

export async function listFormsUsingFieldType(
  typeId: string
): Promise<{ id: string; name: string }[]> {
  const forms = await listRegistrationForms();
  return forms
    .filter((form) => form.fields.some((field) => field.type === typeId))
    .map((form) => ({ id: form.id, name: form.name }));
}
