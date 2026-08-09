import { z } from "zod";
import {
  DEFAULT_COUNTRY,
  isKnownCountry,
  resolveCountry,
} from "@/lib/countries";

export {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  resolveCountry,
} from "@/lib/countries";

/** Sorted A–Z by label. */
export const PLAYER_SPORT_IDS = [
  "american_football",
  "badminton",
  "basketball",
  "cricket",
  "one_touch_volleyball",
  "pickleball",
  "soccer",
  "table_tennis",
  "throwball",
  "volleyball",
] as const;

export type PlayerSportId = (typeof PLAYER_SPORT_IDS)[number];

export const PLAYER_SPORT_LABELS: Record<PlayerSportId, string> = {
  american_football: "American Football",
  badminton: "Badminton",
  basketball: "Basketball",
  cricket: "Cricket",
  one_touch_volleyball: "One-Touch Volleyball",
  pickleball: "Pickleball",
  soccer: "Soccer",
  table_tennis: "Table Tennis",
  throwball: "Throwball",
  volleyball: "Volleyball",
};

export const PLAYER_SKILL_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "competitive",
] as const;

export type PlayerSkillLevel = (typeof PLAYER_SKILL_LEVELS)[number];

export const PLAYER_SKILL_LABELS: Record<PlayerSkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  competitive: "Competitive",
};

export const PLAYER_GENDERS = ["male", "female"] as const;

export type PlayerGender = (typeof PLAYER_GENDERS)[number];

export const PLAYER_GENDER_LABELS: Record<PlayerGender, string> = {
  male: "Male",
  female: "Female",
};

const E164_RE = /^\+[1-9]\d{6,14}$/;
const PERSON_NAME_RE =
  /^[\p{L}](?:[\p{L}\s.'-]{0,58}[\p{L}.])?$/u;
const PLACE_NAME_RE = /^[\p{L}](?:[\p{L}\s.'-]{0,78}[\p{L}.])?$/u;
const RELATION_RE = /^[\p{L}](?:[\p{L}\s-]{0,38}[\p{L}])?$/u;
const ADDRESS_LINE_RE = /^[^\p{Cc}\p{Cn}]{1,120}$/u;
const US_STATE_RE = /^[A-Za-z]{2}$/;
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const INTL_POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,11}$/;
const INTL_STATE_RE = /^[\p{L}](?:[\p{L}\s-]{0,38}[\p{L}])?$/u;
const WEIGHT_RE = /^\d{1,3}(\.\d)?$/;

export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isUnitedStatesCountry(
  country: string | null | undefined
): boolean {
  const c = collapseWhitespace(String(country ?? "")).toLowerCase();
  return c === "united states" || c === "usa" || c === "us";
}

export function normalizePersonName(raw: string): string {
  return collapseWhitespace(raw);
}

/** Normalize phone to E.164. Empty → null. Throws Error with message if invalid. */
export function normalizePhoneE164(
  raw: string | null | undefined,
  country: string | null | undefined
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Enter a valid phone number.");
  }

  let e164: string;
  if (isUnitedStatesCountry(country)) {
    if (digits.length === 10) {
      e164 = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      e164 = `+${digits}`;
    } else if (hadPlus && digits.length >= 7 && digits.length <= 15) {
      // Allow non-US number while country is US only if explicitly +coded
      e164 = `+${digits}`;
    } else {
      throw new Error("US phone must be 10 digits (or +1…).");
    }
  } else if (hadPlus) {
    e164 = `+${digits}`;
  } else if (digits.length >= 7 && digits.length <= 15) {
    throw new Error("Include a country code (e.g. +44…).");
  } else {
    throw new Error("Enter a valid phone with country code.");
  }

  if (!E164_RE.test(e164)) {
    throw new Error("Phone must be in international format (+…).");
  }
  return e164;
}

export function tryNormalizePhoneE164(
  raw: string | null | undefined,
  country: string | null | undefined
): { ok: true; value: string | null } | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizePhoneE164(raw, country) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid phone number.",
    };
  }
}

export function normalizeState(
  raw: string,
  country: string | null | undefined
): string {
  const v = collapseWhitespace(raw);
  if (!v) return "";
  if (isUnitedStatesCountry(country)) return v.toUpperCase();
  return v;
}

export function normalizePostalCode(
  raw: string,
  country: string | null | undefined
): string {
  const v = collapseWhitespace(raw);
  if (!v) return "";
  if (isUnitedStatesCountry(country)) return v;
  return v.toUpperCase();
}

export function validatePersonName(
  raw: string,
  label: string
): string | null {
  const v = normalizePersonName(raw);
  if (!v) return `${label} is required.`;
  if (!PERSON_NAME_RE.test(v)) {
    return `${label} may only contain letters, spaces, hyphens, apostrophes, or periods.`;
  }
  return null;
}

export function validateOptionalPersonName(
  raw: string,
  label: string
): string | null {
  const v = normalizePersonName(raw);
  if (!v) return null;
  if (!PERSON_NAME_RE.test(v)) {
    return `${label} may only contain letters, spaces, hyphens, apostrophes, or periods.`;
  }
  return null;
}

export function validateDateOfBirth(
  iso: string | null | undefined
): string | null {
  const v = String(iso ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use a valid date of birth.";
  const [y, m, d] = v.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  if (
    Number.isNaN(dob.getTime()) ||
    dob.getFullYear() !== y ||
    dob.getMonth() !== m - 1 ||
    dob.getDate() !== d
  ) {
    return "Use a valid date of birth.";
  }
  const age = ageFromDob(v);
  if (age == null || age < 5 || age > 100) {
    return "Age must be between 5 and 100.";
  }
  return null;
}

export function validateAddressFields(input: {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const country = resolveCountry(input.country);
  const us = isUnitedStatesCountry(country);

  const line1 = collapseWhitespace(input.line1);
  const line2 = collapseWhitespace(input.line2);
  const city = collapseWhitespace(input.city);
  const state = normalizeState(input.state, country);
  const postalCode = normalizePostalCode(input.postalCode, country);

  if (line1 && !ADDRESS_LINE_RE.test(line1)) {
    errors.line1 = "Address line 1 contains invalid characters.";
  }
  if (line2 && !ADDRESS_LINE_RE.test(line2)) {
    errors.line2 = "Address line 2 contains invalid characters.";
  }
  if (city && !PLACE_NAME_RE.test(city)) {
    errors.city = "City may only contain letters, spaces, hyphens, apostrophes, or periods.";
  }
  if (state) {
    if (us) {
      if (!US_STATE_RE.test(state)) {
        errors.state = "Use a 2-letter US state code (e.g. CA).";
      }
    } else if (!INTL_STATE_RE.test(state)) {
      errors.state = "State / province contains invalid characters.";
    }
  }
  if (postalCode) {
    if (us) {
      if (!US_ZIP_RE.test(postalCode)) {
        errors.postalCode = "Use a US ZIP (12345 or 12345-6789).";
      }
    } else if (!INTL_POSTAL_RE.test(postalCode)) {
      errors.postalCode = "Postal code contains invalid characters.";
    }
  }
  if (!isKnownCountry(country)) {
    errors.country = "Select a country from the list.";
  }

  return errors;
}

export function validateWeightLbs(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!WEIGHT_RE.test(v)) return "Weight must be a number (optional one decimal).";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 40 || n > 500) {
    return "Weight must be between 40 and 500 lbs.";
  }
  return null;
}

export function validateHeightInputs(
  feetRaw: string,
  inchesRaw: string
): string | null {
  if (!feetRaw.trim() && !inchesRaw.trim()) return null;
  if (!/^\d{1,2}$/.test(feetRaw.trim())) return "Height feet must be a whole number.";
  if (inchesRaw.trim() && !/^\d{1,2}$/.test(inchesRaw.trim())) {
    return "Height inches must be a whole number (0–11).";
  }
  const total = feetInchesToTotal(feetRaw, inchesRaw);
  if (total == null) return "Enter a valid height (inches 0–11).";
  if (total < 24 || total > 108) return "Height must be between 2'0\" and 9'0\".";
  return null;
}

export const PlayerAddressSchema = z.object({
  line1: z.string().max(120).default(""),
  line2: z.string().max(120).optional().nullable(),
  city: z.string().max(80).default(""),
  state: z.string().max(40).default(""),
  postalCode: z.string().max(20).default(""),
  country: z.string().max(80).default(DEFAULT_COUNTRY),
});

export const PlayerSportEntrySchema = z.object({
  preferred: z.boolean().default(false),
  skillLevel: z.enum(PLAYER_SKILL_LEVELS).optional().nullable(),
});

export const PlayerIceContactSchema = z.object({
  name: z.string().max(80).default(""),
  phone: z.string().max(40).default(""),
  relation: z.string().max(40).default(""),
});

export const PlayerProfileSchema = z.object({
  version: z.literal(1).default(1),
  phone: z.string().max(40).optional().nullable(),
  address: PlayerAddressSchema.optional().nullable(),
  dateOfBirth: z
    .union([
      z.literal(""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      z.null(),
    ])
    .optional(),
  gender: z.enum(PLAYER_GENDERS).optional().nullable(),
  heightInches: z.number().min(24).max(108).optional().nullable(),
  weightLbs: z.number().min(40).max(500).optional().nullable(),
  photoPath: z.string().trim().max(500).optional().nullable(),
  sports: z.record(z.string(), PlayerSportEntrySchema).default({}),
  iceContact: PlayerIceContactSchema.optional().nullable(),
  updatedAt: z.string().optional(),
});

export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export type PlayerAddress = z.infer<typeof PlayerAddressSchema>;

export const MemberProfileUpdateSchema = z.object({
  // Names are Google-owned; accepted for compat but ignored on PUT.
  firstName: z.string().max(60).optional().default(""),
  lastName: z.string().max(60).optional().default(""),
  photoURL: z.string().max(2000).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  playerProfile: PlayerProfileSchema,
});

export type MemberProfileUpdate = z.infer<typeof MemberProfileUpdateSchema>;

export type MemberProfileFieldErrors = Record<string, string>;

/** Normalize + validate a member profile update payload. */
export function normalizeAndValidateMemberProfile(body: unknown):
  | { ok: true; data: MemberProfileUpdate }
  | { ok: false; error: string; fieldErrors: MemberProfileFieldErrors } {
  const parsed = MemberProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: MemberProfileFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors,
    };
  }

  const fieldErrors: MemberProfileFieldErrors = {};
  const raw = parsed.data;
  const country = resolveCountry(raw.playerProfile.address?.country);

  // Identity fields are Google-owned (synced on login); ignore client values.
  const firstName = "";
  const lastName = "";
  const photoURL = null;

  const phoneResult = tryNormalizePhoneE164(
    raw.phone ?? raw.playerProfile.phone,
    country
  );
  if (!phoneResult.ok) fieldErrors.phone = phoneResult.error;
  const phone = phoneResult.ok ? phoneResult.value : null;

  const addrIn = raw.playerProfile.address ?? {
    line1: "",
    line2: null,
    city: "",
    state: "",
    postalCode: "",
    country: DEFAULT_COUNTRY,
  };
  const addressErrors = validateAddressFields({
    line1: addrIn.line1 ?? "",
    line2: addrIn.line2 ?? "",
    city: addrIn.city ?? "",
    state: addrIn.state ?? "",
    postalCode: addrIn.postalCode ?? "",
    country,
  });
  for (const [k, v] of Object.entries(addressErrors)) {
    fieldErrors[`address.${k}`] = v;
  }

  const dob = (raw.playerProfile.dateOfBirth || "").trim() || null;
  const dobErr = validateDateOfBirth(dob);
  if (dobErr) fieldErrors.dateOfBirth = dobErr;

  let heightInches = raw.playerProfile.heightInches ?? null;
  if (heightInches != null) {
    if (!Number.isInteger(heightInches) || heightInches < 24 || heightInches > 108) {
      fieldErrors.heightInches = "Height must be between 2'0\" and 9'0\".";
      heightInches = null;
    }
  }

  let weightLbs = raw.playerProfile.weightLbs ?? null;
  if (weightLbs != null) {
    if (!Number.isFinite(weightLbs) || weightLbs < 40 || weightLbs > 500) {
      fieldErrors.weightLbs = "Weight must be between 40 and 500 lbs.";
      weightLbs = null;
    } else {
      weightLbs = Math.round(weightLbs * 10) / 10;
    }
  }

  const ice = raw.playerProfile.iceContact;
  const iceName = normalizePersonName(ice?.name ?? "");
  const iceRelation = collapseWhitespace(ice?.relation ?? "");
  const iceNameErr = validateOptionalPersonName(iceName, "ICE name");
  if (iceNameErr) fieldErrors.iceName = iceNameErr;
  if (iceRelation && !RELATION_RE.test(iceRelation)) {
    fieldErrors.iceRelation =
      "Relation may only contain letters, spaces, or hyphens.";
  }
  const icePhoneResult = tryNormalizePhoneE164(ice?.phone ?? "", country);
  if (!icePhoneResult.ok && String(ice?.phone ?? "").trim()) {
    fieldErrors.icePhone = icePhoneResult.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: Object.values(fieldErrors)[0] || "Validation failed",
      fieldErrors,
    };
  }

  const line1 = collapseWhitespace(addrIn.line1 ?? "");
  const line2 = collapseWhitespace(addrIn.line2 ?? "") || null;
  const city = collapseWhitespace(addrIn.city ?? "");
  const state = normalizeState(addrIn.state ?? "", country);
  const postalCode = normalizePostalCode(addrIn.postalCode ?? "", country);

  const sports: PlayerProfile["sports"] = {};
  for (const [sportId, entry] of Object.entries(raw.playerProfile.sports ?? {})) {
    if (!entry) continue;
    const preferred = Boolean(entry.preferred);
    const skillLevel = entry.skillLevel ?? null;
    if (!preferred && !skillLevel) continue;
    sports[sportId] = {
      preferred,
      ...(skillLevel ? { skillLevel } : {}),
    };
  }

  const icePhoneValue = icePhoneResult.ok ? icePhoneResult.value : null;
  const iceContact =
    iceName || icePhoneValue || iceRelation
      ? {
          name: iceName,
          phone: icePhoneValue ?? "",
          relation: iceRelation,
        }
      : null;

  const hasAddress =
    line1 ||
    city ||
    state ||
    postalCode ||
    (country && country !== DEFAULT_COUNTRY);

  const data: MemberProfileUpdate = {
    firstName,
    lastName,
    photoURL,
    phone,
    playerProfile: {
      version: 1,
      phone,
      address: hasAddress
        ? {
            line1,
            line2,
            city,
            state,
            postalCode,
            country,
          }
        : null,
      dateOfBirth: dob,
      gender: raw.playerProfile.gender ?? null,
      heightInches,
      weightLbs,
      photoPath: null,
      sports,
      iceContact,
      updatedAt: new Date().toISOString(),
    },
  };

  return { ok: true, data };
}

export function emptyPlayerProfile(): PlayerProfile {
  return {
    version: 1,
    phone: null,
    address: {
      line1: "",
      line2: null,
      city: "",
      state: "",
      postalCode: "",
      country: DEFAULT_COUNTRY,
    },
    dateOfBirth: null,
    gender: null,
    heightInches: null,
    weightLbs: null,
    photoPath: null,
    sports: {},
    iceContact: { name: "", phone: "", relation: "" },
  };
}

/** Normalize raw Firestore playerProfile (+ legacy top-level fields). */
export function normalizePlayerProfile(
  raw: unknown,
  legacy?: {
    phone?: string | null;
    age?: number | null;
    height?: string | null;
    weight?: string | null;
    iceContact?: { name?: string; phone?: string; relation?: string } | null;
    skillLevels?: Record<string, string> | null;
  }
): PlayerProfile {
  const base = emptyPlayerProfile();
  let rawForParse: unknown = raw;
  if (raw && typeof raw === "object") {
    const copy = { ...(raw as Record<string, unknown>) };
    const g = copy.gender;
    if (
      g != null &&
      g !== "" &&
      !(PLAYER_GENDERS as readonly string[]).includes(String(g))
    ) {
      copy.gender = null;
    }
    // Migrate legacy skill level "pro" → "competitive"
    if (copy.sports && typeof copy.sports === "object") {
      const sportsIn = copy.sports as Record<string, { preferred?: boolean; skillLevel?: string | null }>;
      const sportsOut: Record<string, { preferred?: boolean; skillLevel?: string | null }> = {};
      for (const [id, entry] of Object.entries(sportsIn)) {
        if (!entry || typeof entry !== "object") continue;
        const skill =
          entry.skillLevel === "pro" ? "competitive" : entry.skillLevel;
        sportsOut[id] = { ...entry, skillLevel: skill };
      }
      copy.sports = sportsOut;
    }
    rawForParse = copy;
  }
  const parsed =
    rawForParse && typeof rawForParse === "object"
      ? PlayerProfileSchema.partial().safeParse(rawForParse)
      : null;
  const data = parsed?.success ? parsed.data : {};

  const sports: PlayerProfile["sports"] = { ...(data.sports ?? {}) };
  if (legacy?.skillLevels && typeof legacy.skillLevels === "object") {
    for (const [label, level] of Object.entries(legacy.skillLevels)) {
      const id = legacySportLabelToId(label);
      if (!id) continue;
      const skill = normalizeLegacySkill(level);
      if (!sports[id]) {
        sports[id] = { preferred: true, skillLevel: skill };
      } else if (!sports[id].skillLevel && skill) {
        sports[id] = { ...sports[id], skillLevel: skill };
      }
    }
  }

  let heightInches = data.heightInches ?? null;
  if (heightInches == null && legacy?.height) {
    heightInches = parseHeightToInches(legacy.height);
  }
  let weightLbs = data.weightLbs ?? null;
  if (weightLbs == null && legacy?.weight) {
    weightLbs = parseWeightLbs(legacy.weight);
  }

  const ice = data.iceContact ?? legacy?.iceContact ?? null;
  const country = resolveCountry(data.address?.country ?? DEFAULT_COUNTRY);

  return {
    version: 1,
    phone: data.phone ?? legacy?.phone ?? null,
    address: data.address
      ? {
          line1: data.address.line1 ?? "",
          line2: data.address.line2 ?? null,
          city: data.address.city ?? "",
          state: data.address.state ?? "",
          postalCode: data.address.postalCode ?? "",
          country,
        }
      : { ...base.address!, country },
    dateOfBirth: data.dateOfBirth || null,
    gender: data.gender ?? null,
    heightInches,
    weightLbs,
    photoPath: data.photoPath ?? null,
    sports,
    iceContact: {
      name: ice?.name ?? "",
      phone: ice?.phone ?? "",
      relation: ice?.relation ?? "",
    },
    updatedAt: data.updatedAt,
  };
}

function legacySportLabelToId(label: string): PlayerSportId | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, "_");
  if ((PLAYER_SPORT_IDS as readonly string[]).includes(key)) {
    return key as PlayerSportId;
  }
  const map: Record<string, PlayerSportId> = {
    "table tennis": "table_tennis",
    tabletennis: "table_tennis",
    "american football": "american_football",
    football: "american_football",
    "one-touch volleyball": "one_touch_volleyball",
    "one touch volleyball": "one_touch_volleyball",
  };
  return map[label.trim().toLowerCase()] ?? null;
}

function normalizeLegacySkill(level: string): PlayerSkillLevel | null {
  const v = level.trim().toLowerCase();
  if (v === "pro") return "competitive";
  if ((PLAYER_SKILL_LEVELS as readonly string[]).includes(v)) {
    return v as PlayerSkillLevel;
  }
  return null;
}

export function parseHeightToInches(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const feetInches = s.match(/^(\d+)\s*['′]\s*(\d{1,2})\s*(?:["″]|in)?$/i);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = Number(feetInches[2]);
    if (Number.isFinite(feet) && Number.isFinite(inches)) {
      return feet * 12 + inches;
    }
  }
  const total = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function parseWeightLbs(raw: string): number | null {
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function inchesToFeetInches(total: number | null | undefined): {
  feet: string;
  inches: string;
} {
  if (total == null || !Number.isFinite(total) || total <= 0) {
    return { feet: "", inches: "" };
  }
  const feet = Math.floor(total / 12);
  const inches = Math.round(total % 12);
  return { feet: String(feet), inches: String(inches) };
}

export function feetInchesToTotal(
  feetRaw: string,
  inchesRaw: string
): number | null {
  const feet = feetRaw.trim() === "" ? NaN : Number(feetRaw);
  const inches = inchesRaw.trim() === "" ? 0 : Number(inchesRaw);
  if (!Number.isFinite(feet) || feet < 0) return null;
  if (!Number.isFinite(inches) || inches < 0 || inches >= 12) return null;
  const total = feet * 12 + inches;
  return total > 0 ? total : null;
}

/** Age in whole years from ISO YYYY-MM-DD, or null. */
export function ageFromDob(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const md = today.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** BMI from height (inches) and weight (lbs), or null. */
export function bmiFromHeightWeight(
  heightInches: number | null | undefined,
  weightLbs: number | null | undefined
): number | null {
  if (
    heightInches == null ||
    weightLbs == null ||
    !Number.isFinite(heightInches) ||
    !Number.isFinite(weightLbs) ||
    heightInches <= 0 ||
    weightLbs <= 0
  ) {
    return null;
  }
  const bmi = (weightLbs / (heightInches * heightInches)) * 703;
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}
