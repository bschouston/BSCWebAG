/**
 * Wipe one club member by email for a full retest (Auth + related Firestore).
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/wipe-member-by-email.ts mosalim786@gmail.com
 * Apply:
 *   npx tsx --env-file=.env.local scripts/wipe-member-by-email.ts mosalim786@gmail.com --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";

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

async function deleteQueryDocs(
  db: Firestore,
  collection: string,
  field: string,
  value: string
): Promise<string[]> {
  const snap = await db.collection(collection).where(field, "==", value).get();
  const ids: string[] = [];
  let batch = db.batch();
  let ops = 0;
  for (const d of snap.docs) {
    ids.push(d.id);
    batch.delete(d.ref);
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return ids;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const emailArg = process.argv.find((a) => a.includes("@"));
  if (!emailArg) {
    console.error("Usage: wipe-member-by-email.ts <email> [--apply]");
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const { db, auth } = getClients();

  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch {
    console.error(`No Firebase Auth user for ${email}`);
    process.exit(1);
  }

  const uid = authUser.uid;
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;
  const itsNumber =
    typeof userData?.itsNumber === "string" ? userData.itsNumber.trim() : "";
  const calendarFeedToken =
    typeof userData?.calendarFeedToken === "string" ? userData.calendarFeedToken : "";

  const rsvpSnap = await db.collection("event_rsvps").where("userId", "==", uid).get();
  const txSnap = await db.collection("token_transactions").where("userId", "==", uid).get();
  const reqSnap = await db.collection("tokenRequests").where("memberUid", "==", uid).get();
  const transferOut = await db.collection("tokenTransfers").where("fromUid", "==", uid).get();
  const transferIn = await db.collection("tokenTransfers").where("toUid", "==", uid).get();
  const pinSnap = await db.collection("walletPinChallenges").where("uid", "==", uid).get();

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    email,
    uid,
    role: userData?.role ?? null,
    itsNumber: itsNumber || null,
    calendarFeedToken: calendarFeedToken ? "[set]" : null,
    firestoreUserDoc: userSnap.exists,
    counts: {
      event_rsvps: rsvpSnap.size,
      token_transactions: txSnap.size,
      tokenRequests: reqSnap.size,
      tokenTransfers: transferOut.size + transferIn.size,
      walletPinChallenges: pinSnap.size,
    },
  }, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete.");
    return;
  }

  // Soft-adjust weekly event counters for active RSVPs before deleting them.
  for (const d of rsvpSnap.docs) {
    const data = d.data();
    const eventId = typeof data.eventId === "string" ? data.eventId : "";
    if (!eventId) continue;
    const status = String(data.status || "");
    if (status !== "CONFIRMED" && status !== "WAITLISTED") continue;
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (status === "CONFIRMED") patch.confirmedCount = FieldValue.increment(-1);
    if (status === "WAITLISTED") patch.waitlistCount = FieldValue.increment(-1);
    await db.collection("events").doc(eventId).update(patch).catch(() => undefined);
  }

  const deletedRsvps = await deleteQueryDocs(db, "event_rsvps", "userId", uid);
  const deletedTx = await deleteQueryDocs(db, "token_transactions", "userId", uid);
  const deletedReqs = await deleteQueryDocs(db, "tokenRequests", "memberUid", uid);
  const deletedTransfersFrom = await deleteQueryDocs(db, "tokenTransfers", "fromUid", uid);
  const deletedTransfersTo = await deleteQueryDocs(db, "tokenTransfers", "toUid", uid);

  // PIN docs are usually uid_* ids; also clear any leftover by prefix scan if needed
  for (const d of pinSnap.docs) {
    await d.ref.delete();
  }
  const pinPrefix = await db.collection("walletPinChallenges").get();
  let pinExtra = 0;
  for (const d of pinPrefix.docs) {
    if (d.id.startsWith(`${uid}_`)) {
      await d.ref.delete();
      pinExtra += 1;
    }
  }

  if (itsNumber) {
    await db.collection("itsIndex").doc(itsNumber).delete().catch(() => undefined);
  }
  if (calendarFeedToken) {
    await db.collection("calendarFeeds").doc(calendarFeedToken).delete().catch(() => undefined);
  }

  if (userSnap.exists) {
    await userRef.delete();
  }

  await auth.deleteUser(uid);

  console.log(JSON.stringify({
    ok: true,
    deleted: {
      authUser: uid,
      usersDoc: userSnap.exists,
      itsIndex: itsNumber || null,
      calendarFeed: Boolean(calendarFeedToken),
      event_rsvps: deletedRsvps.length,
      token_transactions: deletedTx.length,
      tokenRequests: deletedReqs.length,
      tokenTransfers: deletedTransfersFrom.length + deletedTransfersTo.length,
      walletPinChallenges: pinSnap.size + pinExtra,
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
