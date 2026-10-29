import type { RegistrationFieldType, RegistrationFormField } from "./types";

/** Input behaviors the form renderer knows how to draw and validate. */
export const FIELD_BEHAVIORS = [
  "text",
  "email",
  "tel",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "checkboxGroup",
  "textarea",
  "rating",
  "photo",
  "signature",
  "skillsGrid",
  "matrix",
] as const satisfies readonly RegistrationFieldType[];

export type FieldTypeDefinition = {
  id: string;
  name: string;
  base: RegistrationFieldType;
  sublabel: string;
  example: string;
};

export const FIELD_BEHAVIOR_LABELS: Record<RegistrationFieldType, string> = {
  text: "Text",
  email: "Email",
  tel: "Phone",
  number: "Number",
  date: "Date",
  select: "Select",
  radio: "Radio",
  checkbox: "Checkbox",
  checkboxGroup: "Checkbox group",
  textarea: "Text area",
  rating: "Rating (1–10)",
  photo: "Photo upload",
  signature: "Signature",
  skillsGrid: "Skills grid",
  matrix: "Matrix / table",
};

const PHOTO_SUBLABEL =
  "Please upload a clear, recent photo of yourself for your player profile.";
const SIGNATURE_SUBLABEL = "Please sign your name inside the box above to accept the terms.";

/** Used when the catalog document has not been saved yet. */
export const DEFAULT_FIELD_TYPES: FieldTypeDefinition[] = [
  { id: "text", name: "Text", base: "text", sublabel: "", example: "" },
  { id: "email", name: "Email", base: "email", sublabel: "", example: "example@example.com" },
  { id: "tel", name: "Phone", base: "tel", sublabel: "", example: "(###) ###-####" },
  { id: "number", name: "Number", base: "number", sublabel: "", example: "" },
  { id: "date", name: "Date", base: "date", sublabel: "", example: "" },
  { id: "select", name: "Select", base: "select", sublabel: "", example: "" },
  { id: "radio", name: "Radio", base: "radio", sublabel: "", example: "" },
  { id: "checkbox", name: "Checkbox", base: "checkbox", sublabel: "", example: "" },
  { id: "checkboxGroup", name: "Checkbox group", base: "checkboxGroup", sublabel: "", example: "" },
  { id: "textarea", name: "Text area", base: "textarea", sublabel: "", example: "" },
  { id: "rating", name: "Rating (1–10)", base: "rating", sublabel: "", example: "" },
  { id: "photo", name: "Photo upload", base: "photo", sublabel: PHOTO_SUBLABEL, example: "" },
  { id: "signature", name: "Signature", base: "signature", sublabel: SIGNATURE_SUBLABEL, example: "" },
  { id: "skillsGrid", name: "Skills grid", base: "skillsGrid", sublabel: "", example: "" },
  { id: "matrix", name: "Matrix / table", base: "matrix", sublabel: "", example: "" },
];

export function isFieldBehavior(value: string): value is RegistrationFieldType {
  return (FIELD_BEHAVIORS as readonly string[]).includes(value);
}

export function slugifyFieldTypeId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function fieldTypeById(
  types: FieldTypeDefinition[],
  typeId: string
): FieldTypeDefinition | undefined {
  return types.find((type) => type.id === typeId);
}

/** Behavior used to render and validate. Unknown ids fall back to text. */
export function fieldBehavior(types: FieldTypeDefinition[], typeId: string): RegistrationFieldType {
  const found = fieldTypeById(types, typeId);
  if (found && isFieldBehavior(found.base)) return found.base;
  if (isFieldBehavior(typeId)) return typeId;
  return "text";
}

export function fieldExample(types: FieldTypeDefinition[], typeId: string): string {
  return fieldTypeById(types, typeId)?.example.trim() ?? "";
}

export function fieldSublabel(types: FieldTypeDefinition[], typeId: string): string {
  return fieldTypeById(types, typeId)?.sublabel.trim() ?? "";
}

/** Optional text stored on the field, shown beside its label. */
export function fieldDescriptionText(field: RegistrationFormField): string {
  return field.description?.trim() ?? "";
}

export function readFieldTypeDefinition(value: unknown): FieldTypeDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const base = typeof row.base === "string" ? row.base.trim() : "";
  if (!id || !name || !isFieldBehavior(base)) return null;
  return {
    id,
    name,
    base,
    sublabel: typeof row.sublabel === "string" ? row.sublabel : "",
    example: typeof row.example === "string" ? row.example : "",
  };
}
