export type PlayerProfileVisibility = "public" | "private";

export type TournamentProfileField = {
  id: string;
  label: string;
  visibility: PlayerProfileVisibility;
};

/** Saved on the tournament at convert time and reused for later signups. */
export type TournamentPlayerProfileConfig = {
  nameFieldIds: string[];
  portraitFieldId: string | null;
  fields: TournamentProfileField[];
};

export type PlayerProfileLine = {
  id: string;
  label: string;
  value: string;
};

export type BuiltTournamentPlayer = {
  displayName: string;
  portraitUrl: string | null;
  publicProfile: PlayerProfileLine[];
  privateProfile: PlayerProfileLine[];
};

type FormFieldRef = { id: string; label: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Readable text for a stored registration answer. Empty answers are omitted. */
export function formatRegistrationValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:") && trimmed.length > 180) return "Saved";
    return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatRegistrationValue(item)).filter((item): item is string => !!item);
    return parts.length ? parts.join(", ") : null;
  }
  if (isRecord(value)) {
    if (typeof value.toDate === "function") {
      try {
        const date = (value.toDate as () => Date)();
        if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toLocaleDateString();
      } catch {
        return null;
      }
    }
    const parts: string[] = [];
    for (const [key, nested] of Object.entries(value)) {
      const formatted = formatRegistrationValue(nested);
      if (formatted) parts.push(`${key}: ${formatted}`);
    }
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

export function readTournamentPlayerProfile(value: unknown): TournamentPlayerProfileConfig | null {
  if (!isRecord(value)) return null;
  const nameFieldIds = Array.isArray(value.nameFieldIds)
    ? value.nameFieldIds.filter((id): id is string => typeof id === "string" && !!id.trim()).map((id) => id.trim())
    : [];
  if (!nameFieldIds.length) return null;
  const portraitRaw = value.portraitFieldId;
  const portraitFieldId = typeof portraitRaw === "string" && portraitRaw.trim() ? portraitRaw.trim() : null;
  const fields: TournamentProfileField[] = [];
  if (Array.isArray(value.fields)) {
    for (const item of value.fields) {
      if (!isRecord(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const visibility = item.visibility === "private" ? "private" : item.visibility === "public" ? "public" : null;
      if (!id || !label || !visibility) continue;
      fields.push({ id, label, visibility });
    }
  }
  return { nameFieldIds, portraitFieldId, fields };
}

export function playerProfileConfigFromInput(
  raw: unknown,
  formFields: FormFieldRef[]
): { config: TournamentPlayerProfileConfig } | { error: string } {
  if (!isRecord(raw)) return { error: "Choose the fields for the player profile." };
  const byId = new Map(formFields.map((field) => [field.id, field.label.trim() || field.id]));
  const nameFieldIds = Array.isArray(raw.nameFieldIds)
    ? raw.nameFieldIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean)
    : [];
  if (!nameFieldIds.length) return { error: "Choose at least one field for the player name." };
  if (new Set(nameFieldIds).size !== nameFieldIds.length) {
    return { error: "Each name field can only be used once." };
  }
  for (const id of nameFieldIds) {
    if (!byId.has(id)) return { error: "A name field is not on this registration form." };
  }

  const portraitRaw = raw.portraitFieldId;
  const portraitFieldId =
    portraitRaw == null || portraitRaw === ""
      ? null
      : typeof portraitRaw === "string"
        ? portraitRaw.trim() || null
        : null;
  if (portraitRaw != null && portraitRaw !== "" && !portraitFieldId) {
    return { error: "Portrait field is invalid." };
  }
  if (portraitFieldId) {
    if (!byId.has(portraitFieldId)) return { error: "The portrait field is not on this registration form." };
    if (nameFieldIds.includes(portraitFieldId)) {
      return { error: "The portrait field cannot also be a name field." };
    }
  }

  if (!Array.isArray(raw.fields)) return { error: "Choose which other fields to copy." };
  const fields: TournamentProfileField[] = [];
  const seen = new Set<string>();
  for (const item of raw.fields) {
    if (!isRecord(item)) return { error: "A profile field is invalid." };
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || !byId.has(id)) return { error: "A profile field is not on this registration form." };
    if (nameFieldIds.includes(id) || id === portraitFieldId) {
      return { error: "Name and portrait fields are not listed again as profile fields." };
    }
    if (seen.has(id)) return { error: "Each profile field can only be copied once." };
    seen.add(id);
    if (item.visibility !== "public" && item.visibility !== "private") {
      return { error: "Mark every copied field public or private." };
    }
    fields.push({ id, label: byId.get(id) ?? id, visibility: item.visibility });
  }

  return { config: { nameFieldIds, portraitFieldId, fields } };
}

function rawPortraitValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function buildTournamentPlayer(
  registration: Record<string, unknown>,
  config: TournamentPlayerProfileConfig
): BuiltTournamentPlayer {
  const nameParts = config.nameFieldIds
    .map((id) => formatRegistrationValue(registration[id]))
    .filter((part): part is string => !!part);
  const displayName = nameParts.join(" ").trim() || "Player";
  const portraitUrl = config.portraitFieldId
    ? rawPortraitValue(registration[config.portraitFieldId])
    : null;
  const publicProfile: PlayerProfileLine[] = [];
  const privateProfile: PlayerProfileLine[] = [];
  for (const field of config.fields) {
    const value = formatRegistrationValue(registration[field.id]);
    if (!value) continue;
    const line = { id: field.id, label: field.label, value };
    if (field.visibility === "private") privateProfile.push(line);
    else publicProfile.push(line);
  }
  return { displayName, portraitUrl, publicProfile, privateProfile };
}
