/**
 * Force-delete one weekly occurrence by title (+ optional Chicago date key YYYY-MM-DD).
 * Bypasses cancelled/completed guards — for test cleanup only.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/force-delete-weekly-occurrence.ts "Weekly Soccer" 2026-09-28
 * Apply:
 *   npx tsx --env-file=.env.local scripts/force-delete-weekly-occurrence.ts "Weekly Soccer" 2026-09-28 --apply
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

function chicagoDateKey(value: unknown): string | null {
  if (!value) return null;
  let d: Date | null = null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    d = (value as { toDate: () => Date }).toDate();
  } else if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string" || typeof value === "number") {
    d = new Date(value);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
  const args = process.argv.slice(2).filter((a) => a !== "--apply");
  const titleArg = args[0]?.trim();
  const dateKey = args[1]?.trim() || null;
  if (!titleArg) {
    console.error('Usage: force-delete-weekly-occurrence.ts "<title>" [YYYY-MM-DD] [--apply]');
    process.exit(1);
  }

  const db = getDb();
  const snap = await db.collection("events").where("category", "==", "WEEKLY_SPORTS").get();
  const matches = snap.docs.filter((doc) => {
    const d = doc.data();
    const title = String(d.title || "").trim();
    if (title.toLowerCase() !== titleArg.toLowerCase()) return false;
    if (!dateKey) return true;
    return chicagoDateKey(d.startTime) === dateKey;
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY_RUN",
        title: titleArg,
        dateKey,
        matchCount: matches.length,
        matches: matches.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            title: d.title,
            status: d.status,
            startChicago: chicagoDateKey(d.startTime),
            seriesId: d.seriesId ?? null,
          };
        }),
      },
      null,
      2
    )
  );

  if (matches.length === 0) {
    console.error("No matching weekly events.");
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error("Multiple matches — pass YYYY-MM-DD to narrow, or fix titles.");
    process.exit(1);
  }

  const doc = matches[0];
  const eventId = doc.id;
  const [rsvps, teams, txs] = await Promise.all([
    db.collection("event_rsvps").where("eventId", "==", eventId).get(),
    db.collection("events").doc(eventId).collection(TEAMS).get(),
    db.collection("token_transactions").where("eventId", "==", eventId).get(),
  ]);

  console.log(
    JSON.stringify(
      {
        related: {
          event_rsvps: rsvps.size,
          weekly_teams: teams.size,
          token_transactions: txs.size,
        },
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete.");
    return;
  }

  const deletedRsvps = await commitDeletes(
    db,
    rsvps.docs.map((d) => d.ref)
  );
  const deletedTeams = await commitDeletes(
    db,
    teams.docs.map((d) => d.ref)
  );
  const deletedTx = await commitDeletes(
    db,
    txs.docs.map((d) => d.ref)
  );
  await doc.ref.delete();

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedEventId: eventId,
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
