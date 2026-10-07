/**
 * Delete mistaken event_rsvps rows for a member on featured/tournament events
 * (orphans that show as Type=RSVP / Token-based on Manage Registrations).
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/cleanup-mistaken-featured-rsvps.ts msalim@gmail.com
 * Apply:
 *   npx tsx --env-file=.env.local scripts/cleanup-mistaken-featured-rsvps.ts msalim@gmail.com --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getClients() {
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
  return { db: getFirestore(), auth: getAuth() };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const emailArg = process.argv.find((a) => a.includes("@"));
  if (!emailArg) {
    console.error("Usage: cleanup-mistaken-featured-rsvps.ts <email> [--apply]");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const { db, auth } = getClients();

  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch {
    const users = await db.collection("users").where("email", "==", email).limit(5).get();
    if (users.empty) {
      console.error(`No user for ${email}`);
      process.exit(1);
    }
    uid = users.docs[0]!.id;
  }

  console.log(`User ${email} → ${uid}`);

  const rsvpSnap = await db.collection("event_rsvps").where("userId", "==", uid).get();
  const candidates: Array<{
    id: string;
    eventId: string;
    status: string;
    title: string;
    category: string;
  }> = [];

  for (const doc of rsvpSnap.docs) {
    const data = doc.data();
    const eventId = typeof data.eventId === "string" ? data.eventId : "";
    if (!eventId) continue;
    const eventSnap = await db.collection("events").doc(eventId).get();
    if (!eventSnap.exists) continue;
    const ed = eventSnap.data() ?? {};
    const category = typeof ed.category === "string" ? ed.category : "";
    if (category === "WEEKLY_SPORTS") continue;
    candidates.push({
      id: doc.id,
      eventId,
      status: typeof data.status === "string" ? data.status : "",
      title: typeof ed.title === "string" ? ed.title : eventId,
      category: category || "(none)",
    });
  }

  if (!candidates.length) {
    console.log("No mistaken featured/tournament event_rsvps found.");
    return;
  }

  console.log(`Found ${candidates.length} orphan RSVP(s) on non-weekly events:`);
  for (const c of candidates) {
    console.log(`  - ${c.id} | ${c.status} | ${c.category} | ${c.title}`);
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete these docs.");
    return;
  }

  for (const c of candidates) {
    await db.collection("event_rsvps").doc(c.id).delete();
    console.log(`Deleted ${c.id}`);
  }
  console.log("Done. Form registrations and weekly RSVPs were not modified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
