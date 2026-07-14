export type RegistrationFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "checkboxGroup"
  | "textarea"
  | "rating"
  | "photo"
  | "signature"
  | "skillsGrid"
  | "matrix";

export type RegistrationFormStatus = "ACTIVE" | "ARCHIVED";

export type RegistrationFormSection = {
  id: string;
  title: string;
  order: number;
};

export type RegistrationFormField = {
  id: string;
  sectionId: string;
  type: RegistrationFieldType;
  label: string;
  description?: string;
  required: boolean;
  enabled: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
  /** For skillsGrid: list of skill keys/labels */
  skillKeys?: { key: string; label: string }[];
  /** For matrix: row labels (e.g. First Choice / Second Choice) */
  matrixRows?: { key: string; label: string }[];
  /** For matrix: column options (e.g. Goalkeeper, Defender, …) */
  matrixColumns?: { key: string; label: string }[];
};

export type RegistrationFormDoc = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: RegistrationFormStatus;
  isSystem?: boolean;
  syncToGoogleSheet?: boolean;
  sections: RegistrationFormSection[];
  fields: RegistrationFormField[];
  duplicatedFrom?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
};

export const FIELD_TYPE_LABELS: Record<RegistrationFieldType, string> = {
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
