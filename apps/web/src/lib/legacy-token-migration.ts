import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { writeAdminAudit } from "@/lib/admin-audit";
import { isValidItsNumber, normalizeItsNumber } from "@/lib/its-number";
import { applyTokenLedgerInTransaction } from "@/lib/token-ledger";

export const LEGACY_MIGRATION_CONFIG_PATH = "legacyTokenMigration/config";
export const LEGACY_ENTITLEMENTS = "legacyTokenEntitlements";
export const LEGACY_IMPORTS = "legacyTokenImports";

export type LegacyMigrationPhase = "staging" | "live" | "retired";

export type LegacyCsvRow = {
  name: string;
  email: string;
  its: string;
  tokens: number;
};

export type LegacyMatchMode = "email_and_its" | "its_only";

export type LegacyMatchStatus =
  | "unmatched"
  | "its_not_claimed"
  | "email_and_its"
  | "its_only"
  | "credited";

export type LegacyMigrationConfig = {
  phase: LegacyMigrationPhase;
  importsLocked: boolean;
  liveAt: string | null;
  liveBy: string | null;
  retiredAt: string | null;
  retiredBy: string | null;
  currentImportId: string | null;
};

function toIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function legacyImportIdempotencyKey(its: string): string {
  return `legacy_import_${normalizeItsNumber(its)}`;
}

export async function getLegacyMigrationConfig(
  adminDb: Firestore = getAdminDb()
): Promise<LegacyMigrationConfig> {
  const snap = await adminDb.doc(LEGACY_MIGRATION_CONFIG_PATH).get();
  const data = snap.data() ?? {};
  const phase =
    data.phase === "live" || data.phase === "retired" || data.phase === "staging"
      ? data.phase
      : "staging";
  return {
    phase,
    importsLocked: data.importsLocked === true || phase === "live" || phase === "retired",
    liveAt: toIso(data.liveAt),
    liveBy: typeof data.liveBy === "string" ? data.liveBy : null,
    retiredAt: toIso(data.retiredAt),
    retiredBy: typeof data.retiredBy === "string" ? data.retiredBy : null,
    currentImportId: typeof data.currentImportId === "string" ? data.currentImportId : null,
  };
}

/** Parse CSV text; throws Error with message for the client. */
export function parseLegacyTokenCsv(text: string): {
  rows: LegacyCsvRow[];
  skippedZero: number;
  totalTokens: number;
} {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new Error("CSV file is empty");

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV must include a header and at least one data row");

  const headerCells = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const expected = ["name", "email", "its", "tokens"];
  if (headerCells.length !== 4 || expected.some((h, i) => headerCells[i] !== h)) {
    throw new Error("CSV header must be exactly Name,Email,ITS,Tokens");
  }

  const rows: LegacyCsvRow[] = [];
  const seenIts = new Set<string>();
  let skippedZero = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length !== 4) {
      throw new Error(`Row ${i + 1}: expected 4 columns (Name,Email,ITS,Tokens)`);
    }
    const name = cells[0].trim();
    const email = cells[1].trim().toLowerCase();
    const itsRaw = cells[2].trim();
    const tokensRaw = cells[3].trim();
    const its = normalizeItsNumber(itsRaw);
    const tokens = Number(tokensRaw);

    if (!email) throw new Error(`Row ${i + 1}: email is required`);
    if (!isValidItsNumber(its)) {
      throw new Error(`Row ${i + 1}: ITS must be exactly 8 digits (got “${itsRaw}”)`);
    }
    if (!Number.isInteger(tokens) || tokens < 0) {
      throw new Error(`Row ${i + 1}: Tokens must be a non-negative whole number`);
    }
    if (seenIts.has(its)) {
      throw new Error(`Row ${i + 1}: duplicate ITS ${its} in file`);
    }
    seenIts.add(its);

    if (tokens === 0) {
      skippedZero += 1;
      continue;
    }

    rows.push({
      name: name || "Unknown",
      email,
      its,
      tokens,
    });
  }

  if (rows.length === 0) {
    throw new Error("No rows with Tokens > 0 to import");
  }

  const totalTokens = rows.reduce((sum, r) => sum + r.tokens, 0);
  return { rows, skippedZero, totalTokens };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export async function stageLegacyTokenCsv(opts: {
  adminUid: string;
  filename: string;
  csvText: string;
}): Promise<{
  importId: string;
  rowCount: number;
  skippedZero: number;
  totalTokens: number;
}> {
  const adminDb = getAdminDb();
  const config = await getLegacyMigrationConfig(adminDb);
  if (config.importsLocked || config.phase !== "staging") {
    throw new Error("Imports are locked. Go live has already been activated.");
  }

  const { rows, skippedZero, totalTokens } = parseLegacyTokenCsv(opts.csvText);
  const importRef = adminDb.collection(LEGACY_IMPORTS).doc();
  const importId = importRef.id;

  const existing = await adminDb.collection(LEGACY_ENTITLEMENTS).get();
  const batchDeletes: DocumentReference[] = [];
  for (const doc of existing.docs) {
    if (doc.data()?.status === "credited") {
      throw new Error(
        "Cannot replace import: some entitlements are already credited. This should not happen in staging."
      );
    }
    batchDeletes.push(doc.ref);
  }

  // Delete pending in chunks
  for (let i = 0; i < batchDeletes.length; i += 400) {
    const batch = adminDb.batch();
    for (const ref of batchDeletes.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }

  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = adminDb.batch();
    for (const row of chunk) {
      batch.set(adminDb.collection(LEGACY_ENTITLEMENTS).doc(row.its), {
        name: row.name,
        email: row.email,
        its: row.its,
        tokens: row.tokens,
        importId,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  await importRef.set({
    filename: opts.filename,
    uploadedBy: opts.adminUid,
    uploadedAt: FieldValue.serverTimestamp(),
    rowCount: rows.length,
    skippedZero,
    totalTokens,
  });

  await adminDb.doc(LEGACY_MIGRATION_CONFIG_PATH).set(
    {
      phase: "staging",
      importsLocked: false,
      currentImportId: importId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAdminAudit({
    adminUid: opts.adminUid,
    targetUid: opts.adminUid,
    action: "legacy_token.import_staged",
    meta: { importId, rowCount: rows.length, skippedZero, totalTokens, filename: opts.filename },
  });

  return { importId, rowCount: rows.length, skippedZero, totalTokens };
}

export async function goLiveLegacyMigration(adminUid: string): Promise<LegacyMigrationConfig> {
  const adminDb = getAdminDb();
  const config = await getLegacyMigrationConfig(adminDb);
  if (config.phase === "live") return config;
  if (config.phase === "retired") {
    throw new Error("Migration is retired. Re-enable live first if you need claims again.");
  }
  if (!config.currentImportId) {
    throw new Error("Upload a CSV before going live");
  }

  await adminDb.doc(LEGACY_MIGRATION_CONFIG_PATH).set(
    {
      phase: "live",
      importsLocked: true,
      liveAt: FieldValue.serverTimestamp(),
      liveBy: adminUid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAdminAudit({
    adminUid,
    targetUid: adminUid,
    action: "legacy_token.go_live",
    meta: { importId: config.currentImportId },
  });

  return getLegacyMigrationConfig(adminDb);
}

export async function setLegacyMigrationRetired(
  adminUid: string,
  retired: boolean
): Promise<LegacyMigrationConfig> {
  const adminDb = getAdminDb();
  const config = await getLegacyMigrationConfig(adminDb);
  if (retired) {
    if (config.phase === "staging") {
      throw new Error("Go live before retiring, or leave staging as-is");
    }
    await adminDb.doc(LEGACY_MIGRATION_CONFIG_PATH).set(
      {
        phase: "retired",
        importsLocked: true,
        retiredAt: FieldValue.serverTimestamp(),
        retiredBy: adminUid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeAdminAudit({
      adminUid,
      targetUid: adminUid,
      action: "legacy_token.retire",
      meta: {},
    });
  } else {
    if (config.phase !== "retired") return config;
    await adminDb.doc(LEGACY_MIGRATION_CONFIG_PATH).set(
      {
        phase: "live",
        importsLocked: true,
        retiredAt: null,
        retiredBy: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await writeAdminAudit({
      adminUid,
      targetUid: adminUid,
      action: "legacy_token.unretire",
      meta: {},
    });
  }
  return getLegacyMigrationConfig(adminDb);
}

export type LegacyEntitlementRow = {
  its: string;
  name: string;
  email: string;
  tokens: number;
  status: "pending" | "credited";
  importId: string | null;
  matchStatus: LegacyMatchStatus;
  matchedUid: string | null;
  matchedEmail: string | null;
  matchedName: string | null;
  matchedTokenBalance: number | null;
  emailMatches: boolean;
  creditedAt: string | null;
  creditedBy: string | null;
};

async function resolveUserByIts(
  adminDb: Firestore,
  its: string
): Promise<{
  uid: string;
  email: string;
  name: string;
  tokenBalance: number;
  itsNumber: string;
} | null> {
  const indexSnap = await adminDb.collection("itsIndex").doc(its).get();
  let uid: string | null =
    indexSnap.exists && typeof indexSnap.data()?.uid === "string" ? indexSnap.data()!.uid : null;

  if (!uid) {
    const q = await adminDb.collection("users").where("itsNumber", "==", its).limit(2).get();
    if (q.size === 1) uid = q.docs[0].id;
    else return null;
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const data = userSnap.data() ?? {};
  const itsNumber =
    typeof data.itsNumber === "string" ? normalizeItsNumber(data.itsNumber) : "";
  if (!isValidItsNumber(itsNumber) || itsNumber !== its) return null;

  return {
    uid,
    email: typeof data.email === "string" ? data.email.trim().toLowerCase() : "",
    name: [data.firstName, data.lastName].filter(Boolean).join(" ") || "Member",
    tokenBalance: typeof data.tokenBalance === "number" ? data.tokenBalance : 0,
    itsNumber,
  };
}

export async function listLegacyEntitlementsWithMatch(): Promise<{
  config: LegacyMigrationConfig;
  entitlements: LegacyEntitlementRow[];
}> {
  const adminDb = getAdminDb();
  const config = await getLegacyMigrationConfig(adminDb);
  const snap = await adminDb.collection(LEGACY_ENTITLEMENTS).get();
  const entitlements: LegacyEntitlementRow[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const its = typeof data.its === "string" ? data.its : doc.id;
    const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
    const status = data.status === "credited" ? "credited" : "pending";
    const tokens = typeof data.tokens === "number" ? data.tokens : 0;
    const name = typeof data.name === "string" ? data.name : "";

    if (status === "credited") {
      entitlements.push({
        its,
        name,
        email,
        tokens,
        status,
        importId: typeof data.importId === "string" ? data.importId : null,
        matchStatus: "credited",
        matchedUid: typeof data.creditedUid === "string" ? data.creditedUid : null,
        matchedEmail: null,
        matchedName: null,
        matchedTokenBalance: null,
        emailMatches: true,
        creditedAt: toIso(data.creditedAt),
        creditedBy: typeof data.creditedBy === "string" ? data.creditedBy : null,
      });
      continue;
    }

    const user = await resolveUserByIts(adminDb, its);
    if (!user) {
      entitlements.push({
        its,
        name,
        email,
        tokens,
        status,
        importId: typeof data.importId === "string" ? data.importId : null,
        matchStatus: "unmatched",
        matchedUid: null,
        matchedEmail: null,
        matchedName: null,
        matchedTokenBalance: null,
        emailMatches: false,
        creditedAt: null,
        creditedBy: null,
      });
      continue;
    }

    const emailMatches = Boolean(user.email && email && user.email === email);
    entitlements.push({
      its,
      name,
      email,
      tokens,
      status,
      importId: typeof data.importId === "string" ? data.importId : null,
      matchStatus: emailMatches ? "email_and_its" : "its_only",
      matchedUid: user.uid,
      matchedEmail: user.email || null,
      matchedName: user.name,
      matchedTokenBalance: user.tokenBalance,
      emailMatches,
      creditedAt: null,
      creditedBy: null,
    });
  }

  entitlements.sort((a, b) => a.name.localeCompare(b.name) || a.its.localeCompare(b.its));
  return { config, entitlements };
}

export async function creditLegacyEntitlement(opts: {
  its: string;
  actor: "admin" | "member";
  actorUid: string;
  /** When actor is member, must be their own uid */
  requireEmailMatch: boolean;
}): Promise<{ balance: number; tokens: number; replayed: boolean }> {
  const adminDb = getAdminDb();
  const its = normalizeItsNumber(opts.its);
  if (!isValidItsNumber(its)) throw new Error("Invalid ITS");

  const config = await getLegacyMigrationConfig(adminDb);
  if (config.phase !== "live") {
    throw new Error(
      config.phase === "retired"
        ? "Legacy token claims are retired"
        : "Legacy token credits open only after Go live"
    );
  }

  const result = await adminDb.runTransaction(async (t) => {
    const entRef = adminDb.collection(LEGACY_ENTITLEMENTS).doc(its);
    const entSnap = await t.get(entRef);
    if (!entSnap.exists) throw new Error("Entitlement not found");
    const ent = entSnap.data() ?? {};
    if (ent.status === "credited") throw new Error("Already credited");

    const tokens = typeof ent.tokens === "number" ? ent.tokens : 0;
    if (!Number.isInteger(tokens) || tokens <= 0) throw new Error("Invalid token amount");

    const csvEmail = typeof ent.email === "string" ? ent.email.toLowerCase() : "";
    const csvName = typeof ent.name === "string" ? ent.name : "";
    const importId = typeof ent.importId === "string" ? ent.importId : null;

    const indexRef = adminDb.collection("itsIndex").doc(its);
    const indexSnap = await t.get(indexRef);
    let uid =
      indexSnap.exists && typeof indexSnap.data()?.uid === "string"
        ? (indexSnap.data()!.uid as string)
        : null;

    if (!uid) {
      // Fallback read outside index — cannot query in transaction easily; require index
      throw new Error("ITS is not claimed on this site yet");
    }

    if (opts.actor === "member" && uid !== opts.actorUid) {
      throw new Error("ITS does not belong to your account");
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) throw new Error("Member not found");
    const user = userSnap.data() ?? {};
    const userIts =
      typeof user.itsNumber === "string" ? normalizeItsNumber(user.itsNumber) : "";
    if (userIts !== its) throw new Error("ITS is not claimed on this site yet");

    const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
    const emailMatches = Boolean(userEmail && csvEmail && userEmail === csvEmail);
    if (opts.requireEmailMatch && !emailMatches) {
      throw new Error("Email does not match the legacy record");
    }

    const matchMode: LegacyMatchMode = emailMatches ? "email_and_its" : "its_only";
    const balance =
      typeof user.tokenBalance === "number" ? user.tokenBalance : 0;
    const idempotencyKey = legacyImportIdempotencyKey(its);

    const applied = await applyTokenLedgerInTransaction(t, adminDb, {
      userId: uid,
      userRef,
      currentBalance: balance,
      type: "CREDIT",
      amount: tokens,
      reason: "legacy_import",
      description: "Legacy token balance from previous app",
      idempotencyKey,
      adminUid: opts.actor === "admin" ? opts.actorUid : null,
      meta: {
        source: "legacy_csv",
        importId,
        csvEmail,
        csvName,
        csvIts: its,
        csvTokens: tokens,
        matchMode,
        creditedBy: opts.actor,
        adminUid: opts.actor === "admin" ? opts.actorUid : null,
      },
    });

    t.update(entRef, {
      status: "credited",
      creditedAt: FieldValue.serverTimestamp(),
      creditedUid: uid,
      creditedBy: opts.actor,
      creditedByUid: opts.actorUid,
      matchMode,
      ledgerTxId: idempotencyKey,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { balance: applied.balance, tokens, replayed: applied.replayed, uid, matchMode };
  });

  if (opts.actor === "admin") {
    await writeAdminAudit({
      adminUid: opts.actorUid,
      targetUid: result.uid,
      action: "legacy_token.credit",
      meta: {
        its,
        tokens: result.tokens,
        matchMode: result.matchMode,
        replayed: result.replayed,
      },
    });
  }

  return {
    balance: result.balance,
    tokens: result.tokens,
    replayed: result.replayed,
  };
}

/** Pending claim for the signed-in member (live + email+ITS match only). */
export async function getMemberLegacyClaimPreview(uid: string): Promise<{
  its: string;
  tokens: number;
  name: string;
} | null> {
  const adminDb = getAdminDb();
  const config = await getLegacyMigrationConfig(adminDb);
  if (config.phase !== "live") return null;

  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const user = userSnap.data() ?? {};
  const its =
    typeof user.itsNumber === "string"
      ? normalizeItsNumber(user.itsNumber)
      : typeof user.itsNumber === "number"
        ? normalizeItsNumber(String(user.itsNumber))
        : "";
  if (!isValidItsNumber(its)) return null;
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return null;

  const entSnap = await adminDb.collection(LEGACY_ENTITLEMENTS).doc(its).get();
  if (!entSnap.exists) return null;
  const ent = entSnap.data() ?? {};
  if (ent.status === "credited") return null;
  const csvEmail = typeof ent.email === "string" ? ent.email.toLowerCase() : "";
  if (csvEmail !== email) return null;
  const tokens = typeof ent.tokens === "number" ? ent.tokens : 0;
  if (tokens <= 0) return null;

  return {
    its,
    tokens,
    name: typeof ent.name === "string" ? ent.name : "",
  };
}
