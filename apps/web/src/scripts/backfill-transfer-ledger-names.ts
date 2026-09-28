/**
 * One-off: rewrite historical transfer_in / transfer_out ledger descriptions
 * to include counterparty name + ITS#, and patch tokenTransfers fromName/toName.
 *
 * Usage (from apps/web):
 *   npx tsx src/scripts/backfill-transfer-ledger-names.ts --dry-run
 *   npx tsx src/scripts/backfill-transfer-ledger-names.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const dryRun = process.argv.includes("--dry-run");

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY not found in env.");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKey);
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore();

function memberName(user: Record<string, unknown> | undefined): string {
  if (!user) return "Member";
  const firstName = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const lastName = typeof user.lastName === "string" ? user.lastName.trim() : "";
  const fromProfile = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fromProfile) return fromProfile;
  const display = typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (display) return display;
  return "Member";
}

function transferDescription(
  direction: "out" | "in",
  name: string,
  its: string | null | undefined
): string {
  const itsLabel = typeof its === "string" && its.trim() ? its.trim() : "unknown";
  const label = name.trim() || "Member";
  return direction === "out"
    ? `Transfer to ${label} (ITS# ${itsLabel})`
    : `Transfer from ${label} (ITS# ${itsLabel})`;
}

const userCache = new Map<string, Record<string, unknown> | null>();
const itsUidCache = new Map<string, string | null>();

async function loadUser(uid: string): Promise<Record<string, unknown> | null> {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid)!;
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  userCache.set(uid, data);
  return data;
}

async function uidForIts(its: string): Promise<string | null> {
  if (!its) return null;
  if (itsUidCache.has(its)) return itsUidCache.get(its)!;
  const snap = await db.collection("itsIndex").doc(its).get();
  const uid = snap.exists ? String(snap.data()?.uid ?? "") || null : null;
  itsUidCache.set(its, uid);
  return uid;
}

async function resolveNameAndIts(opts: {
  counterpartyUid?: string;
  itsHint?: string | null;
}): Promise<{ name: string; its: string | null; resolved: boolean }> {
  let uid = opts.counterpartyUid?.trim() || "";
  let its = opts.itsHint?.trim() || null;

  if (!uid && its) {
    uid = (await uidForIts(its)) ?? "";
  }

  const user = uid ? await loadUser(uid) : null;
  if (user) {
    const userIts =
      typeof user.itsNumber === "string" && user.itsNumber.trim()
        ? user.itsNumber.trim()
        : its;
    return { name: memberName(user), its: userIts, resolved: true };
  }

  if (its) {
    return { name: "Member", its, resolved: false };
  }
  return { name: "Member", its: null, resolved: false };
}

async function backfillLedger(adminDb: Firestore) {
  const reasons = ["transfer_out", "transfer_in"] as const;
  let updated = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const reason of reasons) {
    const snap = await adminDb.collection("token_transactions").where("reason", "==", reason).get();
    console.log(`Found ${snap.size} ${reason} rows`);

    for (const doc of snap.docs) {
      const data = doc.data();
      const meta = { ...((data.meta ?? {}) as Record<string, unknown>) };
      const direction = reason === "transfer_out" ? "out" : "in";
      const itsHint =
        direction === "out"
          ? String(meta.toIts ?? "")
          : String(meta.fromIts ?? "");
      const counterpartyUid = String(data.counterpartyUid ?? "");

      const { name, its, resolved } = await resolveNameAndIts({
        counterpartyUid,
        itsHint: itsHint || null,
      });

      const nextDescription = transferDescription(direction, name, its);
      const prevDescription = String(data.description ?? "");

      const nextMeta = { ...meta };
      if (its) {
        if (direction === "out") nextMeta.toIts = its;
        else nextMeta.fromIts = its;
      }
      if (resolved || name !== "Member") {
        if (direction === "out") nextMeta.toName = name;
        else nextMeta.fromName = name;
      }

      const metaChanged = JSON.stringify(meta) !== JSON.stringify(nextMeta);
      const descChanged = prevDescription !== nextDescription;

      if (!descChanged && !metaChanged) {
        skipped += 1;
        continue;
      }

      if (!resolved && !itsHint && !counterpartyUid) {
        unresolved += 1;
        console.log(`  unresolved ${doc.id}: no counterparty`);
        continue;
      }

      if (!resolved) unresolved += 1;

      console.log(
        `  ${dryRun ? "[dry-run] " : ""}${doc.id}: "${prevDescription}" -> "${nextDescription}"`
      );

      if (!dryRun) {
        await doc.ref.update({
          description: nextDescription,
          meta: nextMeta,
        });
      }
      updated += 1;
    }
  }

  return { updated, skipped, unresolved };
}

async function backfillTokenTransfers(adminDb: Firestore) {
  const snap = await adminDb.collection("tokenTransfers").get();
  console.log(`Found ${snap.size} tokenTransfers rows`);
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const fromUid = String(data.fromUid ?? "");
    const toUid = String(data.toUid ?? "");
    const patch: Record<string, unknown> = {};

    if (typeof data.fromName !== "string" || !String(data.fromName).trim()) {
      const fromUser = await loadUser(fromUid);
      if (fromUser) patch.fromName = memberName(fromUser);
    }
    if (typeof data.toName !== "string" || !String(data.toName).trim()) {
      const toUser = await loadUser(toUid);
      if (toUser) patch.toName = memberName(toUser);
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    console.log(
      `  ${dryRun ? "[dry-run] " : ""}tokenTransfers/${doc.id}: ${JSON.stringify(patch)}`
    );
    if (!dryRun) {
      await doc.ref.update(patch);
    }
    updated += 1;
  }

  return { updated, skipped };
}

async function main() {
  console.log(dryRun ? "DRY RUN — no writes" : "LIVE RUN — writing updates");
  const ledger = await backfillLedger(db);
  const transfers = await backfillTokenTransfers(db);
  console.log("\nDone.");
  console.log(
    `Ledger: updated=${ledger.updated} skipped=${ledger.skipped} unresolved=${ledger.unresolved}`
  );
  console.log(`tokenTransfers: updated=${transfers.updated} skipped=${transfers.skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
