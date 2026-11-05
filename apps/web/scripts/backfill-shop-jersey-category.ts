/**
 * One-off: set category = "Jerseys" on all shop products and order lines.
 * Existing inventory is jerseys; this aligns stored data with the new category.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/backfill-shop-jersey-category.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/backfill-shop-jersey-category.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const JERSEY_CATEGORY = "Jerseys";

function getDb() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials in env");
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return getFirestore();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const productsSnap = await db.collection("shopProducts").get();
  let productsToUpdate = 0;
  for (const doc of productsSnap.docs) {
    const data = doc.data();
    const category = typeof data.category === "string" ? data.category : "";
    if (category === JERSEY_CATEGORY) continue;
    productsToUpdate += 1;
    console.log(
      `[product] ${doc.id} "${data.name ?? ""}" category: ${category || "(missing)"} → ${JERSEY_CATEGORY}`
    );
    if (apply) {
      await doc.ref.update({ category: JERSEY_CATEGORY });
    }
  }

  const ordersSnap = await db.collection("shopOrders").get();
  let ordersToUpdate = 0;
  let linesTouched = 0;
  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    const lines = Array.isArray(data.lines) ? data.lines : [];
    let changed = false;
    const nextLines = lines.map((line) => {
      if (!line || typeof line !== "object") return line;
      const o = line as Record<string, unknown>;
      const category = typeof o.category === "string" ? o.category : "";
      if (category === JERSEY_CATEGORY) return line;
      changed = true;
      linesTouched += 1;
      return { ...o, category: JERSEY_CATEGORY };
    });
    if (!changed) continue;
    ordersToUpdate += 1;
    console.log(
      `[order] ${doc.id} — set category on ${nextLines.filter((l) => (l as { category?: string })?.category === JERSEY_CATEGORY).length} line(s)`
    );
    if (apply) {
      await doc.ref.update({ lines: nextLines });
    }
  }

  console.log(
    `\n${apply ? "Applied" : "Dry run"}: ${productsToUpdate} product(s), ${ordersToUpdate} order(s) (${linesTouched} line(s)).`
  );
  if (!apply && (productsToUpdate > 0 || ordersToUpdate > 0)) {
    console.log("Re-run with --apply to write changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
