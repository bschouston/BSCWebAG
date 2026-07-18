import type { RegistrationFormField, RegistrationFormSection } from "./types";
import { JAMAAT_AFFILIATION_OPTIONS } from "./jamaat-options";

const REMOVE_FIELD_IDS = new Set([
  "studentStatus",
  "playFrequency",
  "priorExperience",
  "participatedYears",
  "strongestPosition",
  "skills",
]);

const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "XXXL"];

/**
 * Transform a volleyball-duplicated form into the Soccer Registration field set.
 * Keeps injuries, draftPitch, and all other non-volleyball-experience fields.
 */
export function applySoccerRegistrationFields(
  sections: RegistrationFormSection[],
  fields: RegistrationFormField[]
): { sections: RegistrationFormSection[]; fields: RegistrationFormField[] } {
  const nextSections = sections.map((s) =>
    s.id === "experience" ? { ...s, title: "Skills and experiences" } : s
  );

  let next = fields.filter((f) => !REMOVE_FIELD_IDS.has(f.id));
  next = next.filter((f) => f.id !== "studentStatus" && !/^student/i.test(f.id));

  if (!next.some((f) => f.id === "shortSize")) {
    const shirt = next.find((f) => f.id === "tshirtSize");
    const shirtOrder = shirt?.order ?? 3;
    next = next.map((f) =>
      f.sectionId === "player" && (f.order ?? 0) > shirtOrder
        ? { ...f, order: (f.order ?? 0) + 1 }
        : f
    );
    next.push({
      id: "shortSize",
      sectionId: "player",
      type: "select",
      label: "Short size",
      required: true,
      enabled: true,
      order: shirtOrder + 1,
      options: shirt?.options?.length ? [...shirt.options] : [...SIZE_OPTIONS],
    });
  }

  // Rebuild experience section fields (keep captain if present, replace rest)
  next = next.filter((f) => f.sectionId !== "experience");

  const soccerExperience: RegistrationFormField[] = [
    {
      id: "preferredPosition",
      sectionId: "experience",
      type: "matrix",
      label: "What is your preferred position?",
      description: "Pick at least one option per choice",
      required: true,
      enabled: true,
      order: 0,
      matrixRows: [
        { key: "firstChoice", label: "First Choice" },
        { key: "secondChoice", label: "Second Choice" },
      ],
      matrixColumns: [
        { key: "goalkeeper", label: "Goalkeeper" },
        { key: "defender", label: "Defender" },
        { key: "midfielder", label: "Midfielder" },
        { key: "forward", label: "Forward" },
        { key: "flexible", label: "Flexible" },
      ],
    },
    {
      id: "skillLevel",
      sectionId: "experience",
      type: "radio",
      label: "Skill Level",
      required: true,
      enabled: true,
      order: 1,
      options: ["Beginner", "Intermediate", "Advanced", "Competitive"],
    },
    {
      id: "previousTournaments",
      sectionId: "experience",
      type: "checkboxGroup",
      label: "Did you compete in previous tournaments?",
      description: "Please select all that apply",
      required: false,
      enabled: true,
      order: 2,
      options: [
        "2025/1447h",
        "2024/1446h",
        "2023/1445h",
        "2022/1444h",
        "None / first year",
      ],
    },
    {
      id: "organizedLeaguesOutside",
      sectionId: "experience",
      type: "select",
      label:
        "Have you played in organized leagues/tournaments (outside of the BSC tournaments)?",
      required: true,
      enabled: true,
      order: 3,
      options: ["YES", "NO"],
    },
    {
      id: "isCaptain",
      sectionId: "experience",
      type: "select",
      label: "Would you like to be Captain?",
      required: true,
      enabled: true,
      order: 4,
      options: ["YES", "NO"],
    },
  ];

  next = [...next, ...soccerExperience];

  // Ensure draftPitch / injuries labels are friendly if present
  next = next.map((f) => {
    if (f.id === "jamaatAffiliation") {
      return {
        ...f,
        type: "select" as const,
        label: "Jamaat affiliation",
        required: true,
        enabled: true,
        options: [...JAMAAT_AFFILIATION_OPTIONS],
      };
    }
    if (f.id === "draftPitch") {
      return {
        ...f,
        label: "Why should a captain draft you?",
        description: f.description ?? "At least 4 words if provided",
        enabled: true,
      };
    }
    if (f.id === "injuries") {
      return {
        ...f,
        label: "Health concerns / injuries / limitations",
        enabled: true,
        required: true,
      };
    }
    if (f.id === "participationAgreementSignature") {
      return {
        ...f,
        label: "Tournament Participation Agreement",
        type: "signature" as const,
        required: true,
        enabled: true,
      };
    }
    if (f.id === "waiverSignature") {
      return {
        ...f,
        label: "Release and Waiver of Liability",
        type: "signature" as const,
        required: true,
        enabled: true,
      };
    }
    if (f.id === "playerPhotoUrl") {
      return {
        ...f,
        label: "Player photo",
        description:
          f.description ||
          "Please upload a clear, recent photo of yourself for your player profile.",
        required: true,
        enabled: true,
      };
    }
    return f;
  });

  return { sections: nextSections, fields: next };
}
