import "server-only";
import { JWT } from "google-auth-library";
import { readFileSync } from "node:fs";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Max rows per append request (Sheets API is fine with hundreds; keeps payloads small). */
const APPEND_CHUNK_SIZE = 500;

/** Per-request cap for a single Sheets append (large batches can be slow on cold networks). */
const fetchTimeoutMs = 300_000;

function fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs?: number }
): Promise<Response> {
    const { timeoutMs = fetchTimeoutMs, ...rest } = init;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

export function isGoogleSheetsConfigured(): boolean {
    const hasSa =
        Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
        Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim());
    return Boolean(
        hasSa &&
            process.env.GOOGLE_SHEET_ID?.trim() &&
            process.env.GOOGLE_SHEET_TAB?.trim()
    );
}

function getServiceAccountCredentials(): Record<string, string> {
    const path = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH?.trim();
    const raw = path ? readFileSync(path, "utf8") : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw?.trim()) {
        throw new Error(
            "Google Sheets credentials not set. Set GOOGLE_SERVICE_ACCOUNT_JSON_PATH to a JSON file path (recommended on Plesk), " +
                "or set GOOGLE_SERVICE_ACCOUNT_JSON to the full JSON string."
        );
    }
    try {
        return JSON.parse(raw) as Record<string, string>;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(
            (path
                ? `GOOGLE_SERVICE_ACCOUNT_JSON_PATH points to invalid JSON: ${message}`
                : `GOOGLE_SERVICE_ACCOUNT_JSON contains invalid JSON: ${message}`)
        );
    }
}

async function getSheetsAccessToken(): Promise<string> {
    const creds = getServiceAccountCredentials();
    const client = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: [SHEETS_SCOPE],
    });
    const tokenRes = await client.getAccessToken();
    const token =
        typeof tokenRes === "string" ? tokenRes : tokenRes?.token ?? null;
    if (!token) {
        throw new Error("Failed to obtain Google Sheets access token");
    }
    return token;
}

/** Column order for the volleyball registration tab (row 1 in the sheet should use these headers). */
export const VOLLEYBALL_SHEET_HEADERS = [
    "Synced At (UTC)",
    "Registration ID",
    "Event ID",
    "Event Title",
    "Title",
    "First Name",
    "Last Name",
    "ITS",
    "Student Status",
    "Email",
    "WhatsApp",
    "Jamaat Affiliation",
    "Date of Birth",
    "Height",
    "Weight",
    "T-Shirt Size",
    "Instagram",
    "Is Captain",
    "Play Frequency",
    "Prior Experience",
    "Participated Years",
    "Strongest Position",
    "Skill Digging",
    "Skill Passing",
    "Skill Setting",
    "Skill Spiking",
    "Skill Blocking",
    "Skill Serving",
    "Injuries",
    "Draft Pitch",
    "Ideas",
    "Interested In Team Ownership",
    "ICE First Name",
    "ICE Last Name",
    "ICE Phone",
    "Food Allergies",
    "Player Photo URL",
    "Player Photo (Preview)",
    "Payment Status",
    "Payment Type",
    "Amount Paid (Stripe session)",
    "Stripe Session ID",
] as const;

type Reg = Record<string, unknown>;

export type VolleyballSheetRowInput = {
    reg: Reg;
    eventId: string;
    registrationId: string;
    eventTitle: string;
    amountPaid: number;
    stripeSessionId: string;
};

function formatHeight(reg: Reg): string {
    const ft = reg.heightFeet;
    const inch = reg.heightInches;
    const nFt = typeof ft === "number" ? ft : Number(ft);
    const nIn = typeof inch === "number" ? inch : Number(inch);
    if (Number.isFinite(nFt) && Number.isFinite(nIn)) {
        return `${nFt}'${nIn}"`;
    }
    return "";
}

function joinList(v: unknown): string {
    if (Array.isArray(v)) return v.map(String).join("; ");
    if (v == null) return "";
    return String(v);
}

function skill(reg: Reg, key: string): string {
    const skills = reg.skills as Record<string, unknown> | undefined;
    const n = skills?.[key];
    if (typeof n === "number" && Number.isFinite(n)) return String(n);
    if (typeof n === "string" && n.trim() !== "") {
        const parsed = Number(n);
        return Number.isFinite(parsed) ? String(parsed) : "";
    }
    return "";
}

/** Builds one sheet row (same order as VOLLEYBALL_SHEET_HEADERS). */
export function buildVolleyballSheetRow(input: VolleyballSheetRowInput): string[] {
    const { reg, eventId, registrationId, eventTitle, amountPaid, stripeSessionId } = input;

    const syncedAt = new Date().toISOString();
    const photoUrl = String(reg.playerPhotoUrl ?? "").trim();
    const photoPreviewFormula = photoUrl ? `=IMAGE(\"${photoUrl.replace(/\"/g, '\"\"')}\")` : "";
    return [
        syncedAt,
        registrationId,
        eventId,
        eventTitle,
        String(reg.title ?? ""),
        String(reg.firstName ?? ""),
        String(reg.lastName ?? ""),
        String(reg.its ?? ""),
        String(reg.studentStatus ?? ""),
        String(reg.email ?? ""),
        String(reg.whatsappNumber ?? ""),
        String(reg.jamaatAffiliation ?? ""),
        String(reg.dateOfBirth ?? ""),
        formatHeight(reg),
        String(reg.weight ?? ""),
        String(reg.tshirtSize ?? ""),
        String(reg.instagramHandle ?? ""),
        String(reg.isCaptain ?? ""),
        String(reg.playFrequency ?? ""),
        joinList(reg.priorExperience),
        joinList(reg.participatedYears),
        String(reg.strongestPosition ?? ""),
        skill(reg, "digging"),
        skill(reg, "passing"),
        skill(reg, "setting"),
        skill(reg, "spiking"),
        skill(reg, "blocking"),
        skill(reg, "serving"),
        String(reg.injuries ?? ""),
        String(reg.draftPitch ?? ""),
        String(reg.ideas ?? ""),
        reg.interestedInTeamOwnership === true
            ? "Yes"
            : reg.interestedInTeamOwnership === false
              ? "No"
              : "",
        String(reg.iceFirstName ?? ""),
        String(reg.iceLastName ?? ""),
        String(reg.icePhone ?? ""),
        String(reg.foodAllergies ?? ""),
        photoUrl,
        photoPreviewFormula,
        String(reg.paymentStatus ?? ""),
        String(reg.paymentType ?? ""),
        String(amountPaid),
        stripeSessionId,
    ];
}

async function appendRawRowsToSheet(values: string[][], accessToken: string): Promise<void> {
    if (values.length === 0) return;

    const spreadsheetId = process.env.GOOGLE_SHEET_ID!.trim();
    const tab = process.env.GOOGLE_SHEET_TAB!.trim();
    const range = `${tab}!A:AZ`;
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
        `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Google Sheets append failed (${res.status}): ${errText}`);
    }
}

/**
 * Appends many rows in few HTTP calls (batched chunks). One access token for the whole operation.
 */
export async function appendVolleyballRegistrationRowsBatch(
    inputs: VolleyballSheetRowInput[]
): Promise<void> {
    if (!isGoogleSheetsConfigured() || inputs.length === 0) return;

    const token = await getSheetsAccessToken();

    for (let i = 0; i < inputs.length; i += APPEND_CHUNK_SIZE) {
        const chunk = inputs.slice(i, i + APPEND_CHUNK_SIZE);
        const values = chunk.map((input) => buildVolleyballSheetRow(input));
        await appendRawRowsToSheet(values, token);
    }
}

/**
 * Appends one row for a paid volleyball registration. Call only after payment is confirmed.
 */
export async function appendVolleyballRegistrationRow(input: VolleyballSheetRowInput): Promise<void> {
    await appendVolleyballRegistrationRowsBatch([input]);
}
