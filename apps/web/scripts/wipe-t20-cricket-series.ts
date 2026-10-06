/**
 * Hard-delete the T20 Cricket Games weekly series and all related data
 * (occurrences, RSVPs, teams, token_transactions). Other sports untouched.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/wipe-t20-cricket-series.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/wipe-t20-cricket-series.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";

const SERIES_ID = "YAqN8h7PjRiCYNTvEBwd";
const SERIES_TITLE = "T20 Cricket Games";
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

  const seriesRef = db.collection("weeklySeries").doc(SERIES_ID);
  const seriesSnap = await seriesRef.get();
  console.log(
    `series ${SERIES_ID}: ${seriesSnap.exists ? seriesSnap.data()?.title : "NOT FOUND"}`
  );

  const bySeries = await db.collection("events").where("seriesId", "==", SERIES_ID).get();
  const allWeekly = await db.collection("events").where("category", "==", "WEEKLY_SPORTS").get();
  const orphans = allWeekly.docs.filter((d) => {
    if (bySeries.docs.some((b) => b.id === d.id)) return false;
    const title = String(d.data().title || "").trim().toLowerCase();
    return title === SERIES_TITLE.toLowerCase();
  });

  const eventDocs = [...bySeries.docs, ...orphans];
  const eventIds = eventDocs.map((d) => d.id);

  console.log(`occurrences to delete: ${eventDocs.length}`);
  for (const doc of eventDocs) {
    const d = doc.data();
    console.log(
      `  - ${doc.id} | ${d.status} | key=${d.occurrenceKey} | slug=${d.slug} | seriesId=${d.seriesId ?? "—"}`
    );
  }

  let rsvpCount = 0;
  let teamCount = 0;
  let txCount = 0;
  const rsvpRefs: DocumentReference[] = [];
  const teamRefs: DocumentReference[] = [];
  const txRefs: DocumentReference[] = [];

  for (const eventId of eventIds) {
    const [rsvps, teams, txs] = await Promise.all([
      db.collection("event_rsvps").where("eventId", "==", eventId).get(),
      db.collection("events").doc(eventId).collection(TEAMS).get(),
      db.collection("token_transactions").where("eventId", "==", eventId).get(),
    ]);
    rsvpCount += rsvps.size;
    teamCount += teams.size;
    txCount += txs.size;
    rsvpRefs.push(...rsvps.docs.map((d) => d.ref));
    teamRefs.push(...teams.docs.map((d) => d.ref));
    txRefs.push(...txs.docs.map((d) => d.ref));
  }

  console.log(`event_rsvps: ${rsvpCount}`);
  console.log(`weekly_teams: ${teamCount}`);
  console.log(`token_transactions: ${txCount}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to delete.");
    return;
  }

  const deletedRsvps = await commitDeletes(db, rsvpRefs);
  const deletedTeams = await commitDeletes(db, teamRefs);
  const deletedTx = await commitDeletes(db, txRefs);
  const deletedEvents = await commitDeletes(
    db,
    eventDocs.map((d) => d.ref)
  );
  let deletedSeries = 0;
  if (seriesSnap.exists) {
    await seriesRef.delete();
    deletedSeries = 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedSeries,
        deletedEvents,
        deletedRsvps,
        deletedTeams,
        deletedTokenTransactions: deletedTx,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
