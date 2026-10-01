/**
 * Remove legacy `tokensRequired` from weekly events and weeklySeries templates.
 * App logic now uses only tokensMin/tokensMax.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/strip-tokens-required.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/strip-tokens-required.ts --apply
 *
 * Optional: also strip from all events (not just WEEKLY_SPORTS):
 *   npx tsx --env-file=.env.local scripts/strip-tokens-required.ts --apply --all-events
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

function getDb(): Firestore {
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
  const allEvents = process.argv.includes("--all-events");
  const db = getDb();

  console.log(apply ? "APPLY mode" : "DRY RUN (pass --apply to mutate)");
  console.log(allEvents ? "Scope: all events + weeklySeries" : "Scope: WEEKLY_SPORTS events + weeklySeries");

  const eventsSnap = allEvents
    ? await db.collection("events").get()
    : await db.collection("events").where("category", "==", "WEEKLY_SPORTS").get();
  const seriesSnap = await db.collection("weeklySeries").get();

  const eventTargets = eventsSnap.docs.filter((d) =>
    Object.prototype.hasOwnProperty.call(d.data(), "tokensRequired")
  );
  const seriesTargets = seriesSnap.docs.filter((d) =>
    Object.prototype.hasOwnProperty.call(d.data(), "tokensRequired")
  );

  console.log(`events scanned: ${eventsSnap.size} | with tokensRequired: ${eventTargets.length}`);
  console.log(`weeklySeries scanned: ${seriesSnap.size} | with tokensRequired: ${seriesTargets.length}`);

  for (const doc of eventTargets.slice(0, 40)) {
    const d = doc.data();
    console.log(
      `  event ${doc.id} | tokensRequired=${d.tokensRequired} tokensMax=${d.tokensMax ?? "—"} | ${d.title ?? ""}`
    );
  }
  if (eventTargets.length > 40) console.log(`  ... +${eventTargets.length - 40} more events`);

  for (const doc of seriesTargets) {
    const d = doc.data();
    console.log(
      `  series ${doc.id} | tokensRequired=${d.tokensRequired} tokensMax=${d.tokensMax ?? "—"} | ${d.title ?? ""}`
    );
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete tokensRequired.");
    return;
  }

  const targets = [...eventTargets, ...seriesTargets];
  let updated = 0;
  for (let i = 0; i < targets.length; i += 400) {
    const chunk = targets.slice(i, i + 400);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.update(doc.ref, { tokensRequired: FieldValue.delete() });
    }
    await batch.commit();
    updated += chunk.length;
  }

  console.log(`\nRemoved tokensRequired from ${updated} document(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
