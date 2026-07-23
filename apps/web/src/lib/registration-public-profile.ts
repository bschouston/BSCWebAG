/** Public headshot URL from registration (safe to store on the Live player doc). */
export function photoUrlFromRegistration(reg: Record<string, unknown>): string | null {
  const url = String(reg.playerPhotoUrl ?? reg.photoUrl ?? "").trim();
  return url || null;
}

export type PublicRosterSkill = {
  key: string;
  label: string;
  rating: number;
};

const SKILL_LABELS: Record<string, string> = {
  digging: "Digging",
  passing: "Passing",
  setting: "Setting",
  spiking: "Spiking",
  blocking: "Blocking",
  serving: "Serving",
};

/** Age from registration DOB (MM/DD/YYYY). */
export function ageFromDob(dob: string | undefined | null): number | null {
  if (!dob) return null;
  const m = String(dob).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!month || !day || !year) return null;
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function formatHeightFromRegistration(reg: Record<string, unknown>): string | null {
  const nFt = typeof reg.heightFeet === "number" ? reg.heightFeet : Number(reg.heightFeet);
  const nIn = typeof reg.heightInches === "number" ? reg.heightInches : Number(reg.heightInches);
  if (!Number.isFinite(nFt) || !Number.isFinite(nIn)) return null;
  return `${nFt}'${nIn}"`;
}

export function skillsFromRegistration(reg: Record<string, unknown>): PublicRosterSkill[] {
  const raw = reg.skills;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const skills: PublicRosterSkill[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const rating =
      typeof value === "number" ? value : value != null && String(value).trim() !== "" ? Number(value) : NaN;
    if (!Number.isFinite(rating)) continue;
    skills.push({
      key,
      label: SKILL_LABELS[key] ?? key.replace(/^\w/, (c) => c.toUpperCase()),
      rating: Math.round(rating),
    });
  }
  const order = Object.keys(SKILL_LABELS);
  skills.sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return skills;
}

/** Public-safe profile fields derived from an event registration. */
export function publicProfileFromRegistration(reg: Record<string, unknown>): {
  photoUrl: string | null;
  height: string | null;
  skills: PublicRosterSkill[];
  dateOfBirth: string | null;
} {
  const dob = String(reg.dateOfBirth ?? "").trim() || null;
  return {
    photoUrl: photoUrlFromRegistration(reg),
    height: formatHeightFromRegistration(reg),
    skills: skillsFromRegistration(reg),
    dateOfBirth: dob,
  };
}

export function hasCachedPublicProfile(data: Record<string, unknown>): boolean {
  const hasHeight = typeof data.height === "string" && data.height.trim().length > 0;
  const hasDob = typeof data.dateOfBirth === "string" && data.dateOfBirth.trim().length > 0;
  const hasSkills = Array.isArray(data.skills) && data.skills.length > 0;
  // Photo alone is not enough — Teams tab needs height/age/skills too.
  return hasHeight && hasDob && hasSkills;
}

export function parseCachedSkills(value: unknown): PublicRosterSkill[] {
  if (!Array.isArray(value)) return [];
  const skills: PublicRosterSkill[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? "").trim();
    const label = String(row.label ?? key).trim();
    const rating = typeof row.rating === "number" ? row.rating : Number(row.rating);
    if (!key || !Number.isFinite(rating)) continue;
    skills.push({ key, label: label || key, rating: Math.round(rating) });
  }
  return skills;
}
