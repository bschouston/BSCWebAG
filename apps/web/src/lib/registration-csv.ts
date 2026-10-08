import type { RegistrationFormField, RegistrationFormSection } from "@/lib/registration-forms/types";

/** Keys stored on event_registrations that are not selectable form columns. */
export const REGISTRATION_CSV_SYSTEM_KEYS = new Set([
  "eventId",
  "isDraft",
  "status",
  "paymentStatus",
  "registeredAt",
  "waitlistedAt",
  "archivedAt",
  "amount",
  "amountPaid",
  "paymentType",
  "installmentsPaid",
  "totalInstallments",
  "receiptStripeSession",
  "stripeSubscriptionId",
  "stripeLivemode",
  "stripeAmountPaid",
  "googleSheetsSyncedAt",
  "adminCreatedBy",
  "adminCreatedAt",
  "lastReminderSentAt",
  "registrationId",
]);

export type RegistrationCsvColumn = {
  key: string;
  label: string;
  /** meta | form | extra */
  group: "meta" | "form" | "extra";
  /** Signature fields default off in the picker */
  isSignature?: boolean;
};

export type RegistrationCsvSource = {
  id: string;
  status?: string;
  createdAt?: string | null;
  customDetails?: Record<string, unknown> | null;
  /** Flat reg shape (roster page) — additional keys when customDetails is absent */
  user?: unknown;
} & Record<string, unknown>;

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function isSignatureKey(key: string, field?: RegistrationFormField): boolean {
  if (field?.type === "signature") return true;
  return /signature/i.test(key);
}

function formatFirestoreTimestamp(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const secRaw = obj._seconds ?? obj.seconds;
  const nsRaw = obj._nanoseconds ?? obj.nanoseconds;
  if (typeof secRaw !== "number") return null;
  const ms = secRaw * 1000 + (typeof nsRaw === "number" ? Math.floor(nsRaw / 1_000_000) : 0);
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** Normalize a registration into id + status + flat detail bag. */
export function registrationCsvDetails(reg: RegistrationCsvSource): Record<string, unknown> {
  if (reg.customDetails && typeof reg.customDetails === "object") {
    return reg.customDetails;
  }
  const { id: _id, status: _st, createdAt: _ca, customDetails: _cd, user: _u, ...rest } = reg;
  return rest as Record<string, unknown>;
}

export function isRegistrationArchived(reg: RegistrationCsvSource): boolean {
  const d = registrationCsvDetails(reg);
  return Boolean(d.archivedAt);
}

export function formatRegistrationCsvValue(
  key: string,
  value: unknown,
  field?: RegistrationFormField
): string {
  if (isSignatureKey(key, field)) {
    if (value == null || value === "" || value === "data:,") return "Missing";
    if (typeof value === "string" && (value.startsWith("data:image/") || value.length > 20)) {
      return "Signed";
    }
    return value ? "Signed" : "Missing";
  }

  if (value == null || value === "") return "";

  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join("; ");
  }

  if (typeof value === "object") {
    const ts = formatFirestoreTimestamp(value);
    if (ts) return ts;

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "";

    if (field?.type === "skillsGrid" || field?.type === "matrix" || key === "skills") {
      return entries
        .map(([k, v]) => {
          const label =
            field?.skillKeys?.find((s) => s.key === k)?.label ||
            field?.matrixRows?.find((r) => r.key === k)?.label ||
            humanizeKey(k);
          return `${label}: ${v ?? ""}`;
        })
        .join("; ");
    }

    return entries.map(([k, v]) => `${k}: ${v ?? ""}`).join("; ");
  }

  return String(value);
}

export function discoverRegistrationCsvColumns(opts: {
  registrations: RegistrationCsvSource[];
  formFields?: RegistrationFormField[];
  formSections?: RegistrationFormSection[];
}): RegistrationCsvColumn[] {
  const formFields = [...(opts.formFields ?? [])]
    .filter((f) => f.enabled)
    .sort((a, b) => {
      const secA = opts.formSections?.find((s) => s.id === a.sectionId)?.order ?? 0;
      const secB = opts.formSections?.find((s) => s.id === b.sectionId)?.order ?? 0;
      if (secA !== secB) return secA - secB;
      return a.order - b.order;
    });

  const formIds = new Set(formFields.map((f) => f.id));
  const meta: RegistrationCsvColumn[] = [
    { key: "id", label: "Registration ID", group: "meta" },
    { key: "status", label: "Status", group: "meta" },
    { key: "paymentStatus", label: "Payment status", group: "meta" },
    { key: "registeredAt", label: "Registered at", group: "meta" },
    { key: "archivedAt", label: "Archived", group: "meta" },
  ];

  const formCols: RegistrationCsvColumn[] = formFields.map((f) => ({
    key: f.id,
    label: f.label || humanizeKey(f.id),
    group: "form" as const,
    isSignature: f.type === "signature",
  }));

  const dataKeys = new Set<string>();
  for (const reg of opts.registrations) {
    const d = registrationCsvDetails(reg);
    for (const k of Object.keys(d)) {
      if (REGISTRATION_CSV_SYSTEM_KEYS.has(k)) continue;
      if (formIds.has(k)) continue;
      dataKeys.add(k);
    }
  }

  const extra: RegistrationCsvColumn[] = [...dataKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      label: humanizeKey(key),
      group: "extra" as const,
      isSignature: isSignatureKey(key),
    }));

  return [...meta, ...formCols, ...extra];
}

export function defaultSelectedCsvColumnKeys(columns: RegistrationCsvColumn[]): Set<string> {
  const selected = new Set<string>();
  for (const col of columns) {
    if (col.group === "meta" && col.key !== "archivedAt") {
      selected.add(col.key);
      continue;
    }
    if (col.group === "form" && !col.isSignature) {
      selected.add(col.key);
    }
  }
  return selected;
}

function resolveCell(
  reg: RegistrationCsvSource,
  key: string,
  fieldById: Map<string, RegistrationFormField>
): string {
  const details = registrationCsvDetails(reg);

  if (key === "id") return reg.id;
  if (key === "status") return String(reg.status ?? details.status ?? "");
  if (key === "paymentStatus") return String(details.paymentStatus ?? "");
  if (key === "registeredAt") {
    const raw = details.registeredAt ?? reg.createdAt ?? null;
    if (typeof raw === "string") return raw;
    return formatFirestoreTimestamp(raw) ?? "";
  }
  if (key === "archivedAt") {
    return details.archivedAt ? "Yes" : "No";
  }

  const field = fieldById.get(key);
  return formatRegistrationCsvValue(key, details[key], field);
}

export function buildRegistrationCsvRows(opts: {
  registrations: RegistrationCsvSource[];
  columns: RegistrationCsvColumn[];
  selectedKeys: string[];
  includeArchived: boolean;
  formFields?: RegistrationFormField[];
}): unknown[][] {
  const fieldById = new Map((opts.formFields ?? []).map((f) => [f.id, f]));
  const cols = opts.selectedKeys
    .map((k) => opts.columns.find((c) => c.key === k))
    .filter((c): c is RegistrationCsvColumn => Boolean(c));

  const header = cols.map((c) => c.label);
  const rows: unknown[][] = [header];

  for (const reg of opts.registrations) {
    if (!opts.includeArchived && isRegistrationArchived(reg)) continue;
    // Form regs only — skip pure weekly RSVP rows without details
    const details = registrationCsvDetails(reg);
    if (!reg.customDetails && Object.keys(details).length === 0) continue;

    rows.push(cols.map((c) => resolveCell(reg, c.key, fieldById)));
  }

  return rows;
}
