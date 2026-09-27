import type { GenderPolicy } from "@/types";

export function normalizeGenderPolicy(raw: unknown): GenderPolicy {
  if (raw === "MALE_ONLY" || raw === "FEMALE_ONLY") return raw;
  return "ALL";
}

export function memberMatchesGenderPolicy(
  gender: string | null | undefined,
  policyRaw: unknown
): boolean {
  const policy = normalizeGenderPolicy(policyRaw);
  if (policy === "ALL") return true;
  if (policy === "MALE_ONLY") return gender === "male";
  if (policy === "FEMALE_ONLY") return gender === "female";
  return true;
}
