/**
 * One-time sandbox site reset for weekly token testing.
 * Refunds test-mode Stripe PaymentIntents referenced by token_transactions,
 * cancels open/orphan weekly RSVPs, wipes token ledger docs, zeros balances.
 * Does NOT touch tournaments/fantasy. Does NOT run without --apply.
 *
 * Dry run:
 *   npx tsx --env-file=.env.local scripts/reset-sandbox-weekly-tokens.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/reset-sandbox-weekly-tokens.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import Stripe from "stripe";

const API_VERSION = "2026-02-25.clover" as const;

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

function getStripe(mode: "live" | "test"): Stripe {
  const key =
    mode === "test" ? process.env.STRIPE_SECRET_KEY_TEST : process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) {
    throw new Error(
      mode === "test" ? "STRIPE_SECRET_KEY_TEST is not set" : "STRIPE_SECRET_KEY is not set"
    );
  }
  return new Stripe(key, { apiVersion: API_VERSION });
}

function modeFromObjectId(id: string): "live" | "test" {
  return /_test_/.test(id) ? "test" : "live";
}

function modeFromLivemode(livemode: boolean | null | undefined): "live" | "test" {
  return livemode === false ? "test" : "live";
}

async function deleteAllDocs(db: Firestore, collection: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await db.collection(collection).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  console.log(apply ? "APPLY mode" : "DRY RUN (pass --apply to mutate)");

  const txSnap = await db.collection("token_transactions").get();
  const piMap = new Map<
    string,
    { preferred: "live" | "test"; alreadyRefunded: boolean }
  >();
  for (const doc of txSnap.docs) {
    const data = doc.data();
    const piId =
      typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    if (!piId) continue;
    const already =
      Boolean(data.stripeRefundId) || data.stripeChargeStatus === "refunded";
    const preferred =
      typeof data.stripeLivemode === "boolean"
        ? modeFromLivemode(data.stripeLivemode)
        : modeFromObjectId(piId);
    const prev = piMap.get(piId);
    piMap.set(piId, {
      preferred: prev?.preferred ?? preferred,
      alreadyRefunded: (prev?.alreadyRefunded ?? false) || already,
    });
  }

  console.log(`token_transactions: ${txSnap.size}`);
  console.log(`unique PaymentIntents: ${piMap.size}`);

  const rsvpSnap = await db.collection("event_rsvps").get();
  const openOrOrphan: { id: string; eventId: string; status: string; reason: string }[] = [];
  const eventCache = new Map<string, Record<string, unknown> | null>();

  for (const doc of rsvpSnap.docs) {
    const data = doc.data();
    const eventId = typeof data.eventId === "string" ? data.eventId : "";
    const status = typeof data.status === "string" ? data.status : "";
    if (!eventId) continue;

    if (!eventCache.has(eventId)) {
      const ev = await db.collection("events").doc(eventId).get();
      eventCache.set(eventId, ev.exists ? ((ev.data() as Record<string, unknown>) ?? null) : null);
    }
    const eventData = eventCache.get(eventId);
    const missing = eventData == null;
    const isWeekly = eventData?.category === "WEEKLY_SPORTS";
    const open = status === "CONFIRMED" || status === "WAITLISTED";

    if (missing && open) {
      openOrOrphan.push({ id: doc.id, eventId, status, reason: "orphan-open" });
    } else if (isWeekly && open) {
      openOrOrphan.push({ id: doc.id, eventId, status, reason: "weekly-open" });
    } else if (missing) {
      openOrOrphan.push({ id: doc.id, eventId, status, reason: "orphan" });
    }
  }

  console.log(`RSVPs to cancel/delete: ${openOrOrphan.length}`);

  const transferSnap = await db.collection("tokenTransfers").get();
  const requestSnap = await db.collection("tokenRequests").get();
  console.log(`tokenTransfers: ${transferSnap.size}`);
  console.log(`tokenRequests: ${requestSnap.size}`);

  const usersSnap = await db.collection("users").get();
  let usersWithBalance = 0;
  for (const doc of usersSnap.docs) {
    const bal = doc.data().tokenBalance;
    if (typeof bal === "number" && bal !== 0) usersWithBalance += 1;
  }
  console.log(`users with non-zero tokenBalance: ${usersWithBalance} / ${usersSnap.size}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to refund test PIs and wipe ledger.");
    return;
  }

  // 1) Cancel open / orphan RSVPs (no ledger credits — balances wiped next)
  let rsvpsUpdated = 0;
  let orphanTeamsDeleted = 0;
  {
    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };
    for (const row of openOrOrphan) {
      if (row.reason === "orphan") {
        batch.delete(db.collection("event_rsvps").doc(row.id));
      } else {
        batch.update(db.collection("event_rsvps").doc(row.id), {
          status: "CANCELLED",
          tokensHeld: 0,
          cancelledAt: FieldValue.serverTimestamp(),
          cancelReason: "sandbox_reset",
        });
      }
      ops += 1;
      rsvpsUpdated += 1;
      if (ops >= 400) await flush();
    }
    await flush();

    const orphanEventIds = new Set(
      openOrOrphan.filter((r) => r.reason.startsWith("orphan")).map((r) => r.eventId)
    );
    for (const eventId of orphanEventIds) {
      const teams = await db.collection("events").doc(eventId).collection("weekly_teams").get();
      if (teams.empty) continue;
      let tBatch = db.batch();
      let tOps = 0;
      for (const t of teams.docs) {
        tBatch.delete(t.ref);
        tOps += 1;
        orphanTeamsDeleted += 1;
        if (tOps >= 400) {
          await tBatch.commit();
          tBatch = db.batch();
          tOps = 0;
        }
      }
      if (tOps > 0) await tBatch.commit();
    }
  }
  console.log(`RSVPs updated/deleted: ${rsvpsUpdated}; orphan teams deleted: ${orphanTeamsDeleted}`);

  // 2) Refund unique test PaymentIntents
  let refunded = 0;
  let skippedAlready = 0;
  let skippedLive = 0;
  let failed = 0;
  for (const [piId, meta] of piMap) {
    if (meta.alreadyRefunded) {
      skippedAlready += 1;
      continue;
    }
    try {
      const preferred = meta.preferred;
      const order: ("live" | "test")[] =
        preferred === "test" ? ["test", "live"] : ["live", "test"];
      let pi: Stripe.PaymentIntent | null = null;
      let stripe: Stripe | null = null;
      let lastErr: unknown;
      for (const mode of order) {
        if (mode === "test" && !process.env.STRIPE_SECRET_KEY_TEST?.trim()) continue;
        try {
          stripe = getStripe(mode);
          pi = await stripe.paymentIntents.retrieve(piId);
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!pi || !stripe) {
        throw lastErr instanceof Error ? lastErr : new Error(`PI not found: ${piId}`);
      }
      if (pi.livemode === true) {
        console.warn(`REFUSING live PaymentIntent ${piId}`);
        skippedLive += 1;
        continue;
      }
      if (pi.status === "canceled") {
        skippedAlready += 1;
        continue;
      }
      const refund = await stripe.refunds.create({ payment_intent: piId });
      console.log(`Refunded ${piId} → ${refund.id} (${refund.status})`);
      refunded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already been refunded|charge_already_refunded/i.test(message)) {
        skippedAlready += 1;
        continue;
      }
      console.error(`Refund failed for ${piId}:`, message);
      failed += 1;
    }
  }
  console.log(
    `Stripe refunds: ok=${refunded} already=${skippedAlready} liveSkipped=${skippedLive} failed=${failed}`
  );

  // 3) Wipe ledger collections
  const deletedTx = await deleteAllDocs(db, "token_transactions");
  const deletedTransfers = await deleteAllDocs(db, "tokenTransfers");
  const deletedRequests = await deleteAllDocs(db, "tokenRequests");
  console.log(
    `Deleted docs: token_transactions=${deletedTx} tokenTransfers=${deletedTransfers} tokenRequests=${deletedRequests}`
  );

  // 4) Zero balances / clear pending token-request linkage (keep Stripe cards)
  let balancesZeroed = 0;
  {
    let batch = db.batch();
    let ops = 0;
    for (const doc of usersSnap.docs) {
      batch.update(doc.ref, {
        tokenBalance: 0,
        pendingTokenRequestId: FieldValue.delete(),
        tokenAutoReplenishPackageId: FieldValue.delete(),
      });
      ops += 1;
      balancesZeroed += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }
  console.log(`Users token fields reset: ${balancesZeroed}`);
  console.log("Sandbox reset complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
