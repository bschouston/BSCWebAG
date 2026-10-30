import type { RegistrationFieldType, RegistrationFormField } from "./types";
import { fieldBehavior } from "./field-types";
import { getFieldTypeCatalog } from "./field-types-server";
import { getRegistrationForm } from "./server";

/** One saved form field, in section order, for the confirmation email. */
export type ConfirmationEmailField = {
  id: string;
  label: string;
  behavior: RegistrationFieldType;
  skillKeys?: { key: string; label: string }[];
  matrixRows?: { key: string; label: string }[];
  matrixColumns?: { key: string; label: string }[];
};

function toEmailField(
  field: RegistrationFormField,
  types: Parameters<typeof fieldBehavior>[0]
): ConfirmationEmailField {
  return {
    id: field.id,
    label: field.label,
    behavior: fieldBehavior(types, field.type),
    skillKeys: field.skillKeys,
    matrixRows: field.matrixRows,
    matrixColumns: field.matrixColumns,
  };
}

/** Fields from the event's registration form. Empty when the form cannot be loaded. */
export async function confirmationEmailFieldsForEvent(
  eventData: { registrationFormId?: unknown } | null | undefined
): Promise<ConfirmationEmailField[]> {
  const formId =
    typeof eventData?.registrationFormId === "string" ? eventData.registrationFormId.trim() : "";
  if (!formId) return [];

  const [form, catalog] = await Promise.all([
    getRegistrationForm(formId),
    getFieldTypeCatalog(),
  ]);
  if (!form) return [];

  const types = catalog.types;
  const sections = [...form.sections].sort((a, b) => a.order - b.order);
  const enabled = form.fields.filter((field) => field.enabled);
  const used = new Set<string>();
  const ordered: ConfirmationEmailField[] = [];

  const push = (field: RegistrationFormField) => {
    if (used.has(field.id)) return;
    used.add(field.id);
    ordered.push(toEmailField(field, types));
  };

  for (const section of sections) {
    enabled
      .filter((field) => field.sectionId === section.id)
      .sort((a, b) => a.order - b.order)
      .forEach(push);
  }
  enabled
    .filter((field) => !used.has(field.id))
    .sort((a, b) => a.order - b.order)
    .forEach(push);

  return ordered;
}
