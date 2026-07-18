import type { RegistrationFormDoc, RegistrationFormField, RegistrationFormSection } from "./types";
import { JAMAAT_AFFILIATION_OPTIONS } from "./jamaat-options";

const sections: RegistrationFormSection[] = [
  { id: "ownership", title: "Team ownership", order: 0 },
  { id: "personal", title: "Personal information", order: 1 },
  { id: "player", title: "Player profile", order: 2 },
  { id: "experience", title: "Experience & skills", order: 3 },
  { id: "extra", title: "Additional info", order: 4 },
  { id: "emergency", title: "Emergency contact", order: 5 },
  { id: "agreements", title: "Photo & agreements", order: 6 },
];

function f(
  partial: Omit<RegistrationFormField, "enabled" | "required"> & {
    required?: boolean;
    enabled?: boolean;
  }
): RegistrationFormField {
  return {
    enabled: true,
    required: false,
    ...partial,
  };
}

const fields: RegistrationFormField[] = [
  f({
    id: "interestedInTeamOwnership",
    sectionId: "ownership",
    type: "checkbox",
    label: "Interested in team ownership",
    order: 0,
  }),
  f({
    id: "title",
    sectionId: "personal",
    type: "select",
    label: "Title",
    required: true,
    options: ["Bhai", "Mulla", "Shaikh"],
    order: 0,
  }),
  f({
    id: "firstName",
    sectionId: "personal",
    type: "text",
    label: "First name",
    required: true,
    order: 1,
  }),
  f({
    id: "lastName",
    sectionId: "personal",
    type: "text",
    label: "Last name",
    required: true,
    order: 2,
  }),
  f({
    id: "its",
    sectionId: "personal",
    type: "text",
    label: "ITS number",
    description: "Exactly 8 digits",
    required: true,
    order: 3,
  }),
  f({
    id: "jamaatAffiliation",
    sectionId: "personal",
    type: "select",
    label: "Jamaat affiliation",
    required: true,
    options: [...JAMAAT_AFFILIATION_OPTIONS],
    order: 4,
  }),
  f({
    id: "email",
    sectionId: "personal",
    type: "email",
    label: "Email",
    required: true,
    order: 5,
  }),
  f({
    id: "whatsappNumber",
    sectionId: "personal",
    type: "tel",
    label: "WhatsApp number",
    required: true,
    order: 6,
  }),
  f({
    id: "studentStatus",
    sectionId: "personal",
    type: "text",
    label: "Student status",
    order: 7,
  }),
  f({
    id: "dateOfBirth",
    sectionId: "personal",
    type: "text",
    label: "Date of birth",
    description: "MM/DD/YYYY",
    required: true,
    order: 8,
  }),
  f({
    id: "heightFeet",
    sectionId: "player",
    type: "number",
    label: "Height (feet)",
    required: true,
    min: 3,
    max: 8,
    order: 0,
  }),
  f({
    id: "heightInches",
    sectionId: "player",
    type: "number",
    label: "Height (inches)",
    required: true,
    min: 0,
    max: 11,
    order: 1,
  }),
  f({
    id: "weight",
    sectionId: "player",
    type: "number",
    label: "Weight (lbs)",
    required: true,
    min: 50,
    max: 400,
    order: 2,
  }),
  f({
    id: "tshirtSize",
    sectionId: "player",
    type: "select",
    label: "T-shirt size",
    required: true,
    options: ["S", "M", "L", "XL", "XXL", "XXXL"],
    order: 3,
  }),
  f({
    id: "instagramHandle",
    sectionId: "player",
    type: "text",
    label: "Instagram handle",
    order: 4,
  }),
  f({
    id: "isCaptain",
    sectionId: "experience",
    type: "select",
    label: "Willing to be captain?",
    required: true,
    options: ["YES", "NO"],
    order: 0,
  }),
  f({
    id: "playFrequency",
    sectionId: "experience",
    type: "text",
    label: "How often do you play?",
    required: true,
    order: 1,
  }),
  f({
    id: "priorExperience",
    sectionId: "experience",
    type: "checkboxGroup",
    label: "Prior experience",
    options: ["Rec league", "High school", "College", "Club", "None"],
    order: 2,
  }),
  f({
    id: "participatedYears",
    sectionId: "experience",
    type: "checkboxGroup",
    label: "Years participated",
    options: ["2023", "2024", "2025", "First year"],
    order: 3,
  }),
  f({
    id: "strongestPosition",
    sectionId: "experience",
    type: "text",
    label: "Strongest position",
    required: true,
    order: 4,
  }),
  f({
    id: "skills",
    sectionId: "experience",
    type: "skillsGrid",
    label: "Skills (1–10)",
    required: true,
    order: 5,
    skillKeys: [
      { key: "digging", label: "Digging" },
      { key: "passing", label: "Passing" },
      { key: "setting", label: "Setting" },
      { key: "spiking", label: "Spiking" },
      { key: "blocking", label: "Blocking" },
      { key: "serving", label: "Serving" },
    ],
  }),
  f({
    id: "injuries",
    sectionId: "extra",
    type: "textarea",
    label: "Injuries / limitations",
    required: true,
    order: 0,
  }),
  f({
    id: "draftPitch",
    sectionId: "extra",
    type: "textarea",
    label: "Draft pitch",
    description: "At least 4 words if provided",
    order: 1,
  }),
  f({
    id: "ideas",
    sectionId: "extra",
    type: "textarea",
    label: "Ideas / suggestions",
    order: 2,
  }),
  f({
    id: "iceFirstName",
    sectionId: "emergency",
    type: "text",
    label: "ICE first name",
    required: true,
    order: 0,
  }),
  f({
    id: "iceLastName",
    sectionId: "emergency",
    type: "text",
    label: "ICE last name",
    required: true,
    order: 1,
  }),
  f({
    id: "icePhone",
    sectionId: "emergency",
    type: "tel",
    label: "ICE phone",
    required: true,
    order: 2,
  }),
  f({
    id: "foodAllergies",
    sectionId: "emergency",
    type: "textarea",
    label: "Food allergies",
    required: true,
    order: 3,
  }),
  f({
    id: "playerPhotoUrl",
    sectionId: "agreements",
    type: "photo",
    label: "Player photo",
    required: true,
    order: 0,
  }),
  f({
    id: "participationAgreementSignature",
    sectionId: "agreements",
    type: "signature",
    label: "Participation agreement signature",
    required: true,
    order: 1,
  }),
  f({
    id: "waiverSignature",
    sectionId: "agreements",
    type: "signature",
    label: "Waiver signature",
    required: true,
    order: 2,
  }),
];

export const VOLLEYBALL_FORM_ID = "volleyball";

export function volleyballRegistrationFormSeed(
  nowIso: string
): Omit<RegistrationFormDoc, "id"> & { id: string } {
  return {
    id: VOLLEYBALL_FORM_ID,
    name: "Volleyball Registration",
    slug: "volleyball",
    description: "Standard volleyball tournament registration form",
    status: "ACTIVE",
    isSystem: true,
    syncToGoogleSheet: true,
    sections,
    fields,
    duplicatedFrom: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: null,
  };
}

export function slugifyFormName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}
