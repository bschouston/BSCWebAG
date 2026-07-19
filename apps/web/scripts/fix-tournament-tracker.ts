/**
 * One-off: inspect tournaments and fix a converted tournament whose
 * statTrackerId incorrectly defaulted to volleyball.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/fix-tournament-tracker.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/fix-tournament-tracker.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

  const snap = await db.collection("tournaments").get();
  console.log(`Found ${snap.docs.length} tournament(s):`);

  for (const doc of snap.docs) {
    const t = doc.data();
    console.log(
      `- ${doc.id}: name="${t.name}" status=${t.status} statTrackerId=${t.statTrackerId} ` +
        `eventId=${t.eventId ?? "-"} publicLiveEnabled=${t.publicLiveEnabled}`
    );

    // Only fix converted tournaments whose source event is NOT volleyball
    // but whose tracker defaulted to volleyball.
    if (!t.eventId || !String(t.statTrackerId ?? "").startsWith("volleyball")) continue;

    const eventSnap = await db.collection("events").doc(String(t.eventId)).get();
    const sportId = String(eventSnap.data()?.sportId ?? "").toLowerCase().trim();
    console.log(`    source event sportId="${sportId}"`);

    if (!sportId || sportId === "volleyball") continue;

    const newTrackerId = `${sportId}.v1`;
    if (!apply) {
      console.log(
        `    -> DRY RUN: would set statTrackerId="${newTrackerId}", publicIframeEmbedHtml=null`
      );
      continue;
    }
    await doc.ref.update({
      statTrackerId: newTrackerId,
      // The iframe embed is the volleyball Google Sheet — wrong for other sports.
      publicIframeEmbedHtml: null,
    });
    console.log(`    -> APPLIED: statTrackerId="${newTrackerId}"`);
  }

  if (!apply) console.log("\nDry run complete. Re-run with --apply to write changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
