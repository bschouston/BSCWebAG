/**
 * Hard-delete ALL weekly sports events (any status), their RSVPs/teams, and weeklySeries templates.
 * Does NOT touch featured/tournament events. Does NOT run without --apply.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/wipe-all-weekly-events.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/wipe-all-weekly-events.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";

const TEAMS = "weekly_teams";

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

async function commitDeletes(db: Firestore, refs: DocumentReference[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const chunk = refs.slice(i, i + 400);
    const batch = db.batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  console.log(apply ? "APPLY mode" : "DRY RUN (pass --apply to mutate)");

  const eventsSnap = await db.collection("events").where("category", "==", "WEEKLY_SPORTS").get();
  const seriesSnap = await db.collection("weeklySeries").get();
  const eventIds = eventsSnap.docs.map((d) => d.id);

  console.log(`WEEKLY_SPORTS events: ${eventsSnap.size}`);
  console.log(`weeklySeries templates: ${seriesSnap.size}`);
  for (const doc of eventsSnap.docs) {
    const d = doc.data();
    console.log(`  - ${doc.id} | ${d.status ?? "?"} | ${d.title ?? ""} | seriesId=${d.seriesId ?? "—"}`);
  }

  let rsvpCount = 0;
  let teamCount = 0;
  for (const eventId of eventIds) {
    const [rsvps, teams] = await Promise.all([
      db.collection("event_rsvps").where("eventId", "==", eventId).get(),
      db.collection("events").doc(eventId).collection(TEAMS).get(),
    ]);
    rsvpCount += rsvps.size;
    teamCount += teams.size;
  }
  console.log(`event_rsvps to delete: ${rsvpCount}`);
  console.log(`weekly_teams docs to delete: ${teamCount}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete.");
    return;
  }

  let deletedRsvps = 0;
  let deletedTeams = 0;
  for (const eventId of eventIds) {
    const [rsvps, teams] = await Promise.all([
      db.collection("event_rsvps").where("eventId", "==", eventId).get(),
      db.collection("events").doc(eventId).collection(TEAMS).get(),
    ]);
    deletedRsvps += await commitDeletes(
      db,
      rsvps.docs.map((d) => d.ref)
    );
    deletedTeams += await commitDeletes(
      db,
      teams.docs.map((d) => d.ref)
    );
  }

  const deletedEvents = await commitDeletes(
    db,
    eventsSnap.docs.map((d) => d.ref)
  );
  const deletedSeries = await commitDeletes(
    db,
    seriesSnap.docs.map((d) => d.ref)
  );

  console.log(
    `Deleted: events=${deletedEvents} series=${deletedSeries} rsvps=${deletedRsvps} teams=${deletedTeams}`
  );
  console.log("Weekly wipe complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
