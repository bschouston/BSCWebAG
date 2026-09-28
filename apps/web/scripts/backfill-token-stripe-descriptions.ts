/**
 * One-off: set PaymentIntent (and latest Charge) description on the existing
 * Live wallet token purchases that were created without payment_intent_data.description.
 *
 * Targets the four Live Purchase rows from Super Admin → Token transactions:
 *   Yusuf Adamjee, Hussain Marvi, Quresh Tyebji, Murtuza Kantawala
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/backfill-token-stripe-descriptions.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/backfill-token-stripe-descriptions.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

const TARGET_EMAILS = new Set([
  "xaracontracts@gmail.com",
  "hmarvi001@gmail.com",
  "qtyebji@gmail.com",
  "27myk786@gmail.com",
]);

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

function stripeDescription(meta: Record<string, unknown>, tokenAmount: number): string {
  const packageLabel =
    typeof meta.packageLabel === "string" && meta.packageLabel.trim()
      ? meta.packageLabel.trim()
      : null;
  const label = packageLabel || `${tokenAmount} tokens`;
  return `Token package: ${label} (one-time purchase)`.slice(0, 1000);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set (live key required)");
  const stripe = new Stripe(secret, {
    apiVersion: "2026-01-28.clover" as any,
  });

  const purchaseSnap = await db
    .collection("token_transactions")
    .where("reason", "==", "purchase")
    .get();

  type Row = {
    txId: string;
    userId: string;
    email: string;
    name: string;
    tokenAmount: number;
    piId: string;
    description: string;
  };

  const candidates: Row[] = [];

  for (const doc of purchaseSnap.docs) {
    const data = doc.data();
    const piId =
      typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : null;
    if (!piId) continue;
    if (data.stripeLivemode === false) continue;

    const userId = typeof data.userId === "string" ? data.userId : "";
    if (!userId) continue;
    const userSnap = await db.collection("users").doc(userId).get();
    const user = userSnap.data() ?? {};
    const email =
      typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!TARGET_EMAILS.has(email)) continue;

    const meta =
      data.meta && typeof data.meta === "object"
        ? (data.meta as Record<string, unknown>)
        : {};
    const tokenAmount = typeof data.amount === "number" ? data.amount : 0;
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Member";

    candidates.push({
      txId: doc.id,
      userId,
      email,
      name,
      tokenAmount,
      piId,
      description: stripeDescription(meta, tokenAmount),
    });
  }

  console.log(
    `Found ${candidates.length} Live purchase(s) matching target emails (apply=${apply}).`
  );

  if (!candidates.length) {
    console.log("Nothing to update.");
    return;
  }

  for (const row of candidates) {
    const pi = await stripe.paymentIntents.retrieve(row.piId);
    const before = pi.description ?? null;
    console.log(
      `\n${row.name} <${row.email}> tx=${row.txId}\n` +
        `  pi=${row.piId}\n` +
        `  before: ${JSON.stringify(before)}\n` +
        `  after:  ${JSON.stringify(row.description)}`
    );

    if (!apply) continue;

    await stripe.paymentIntents.update(row.piId, { description: row.description });
    const chargeId =
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : pi.latest_charge && typeof pi.latest_charge === "object"
          ? pi.latest_charge.id
          : null;
    if (chargeId) {
      await stripe.charges.update(chargeId, { description: row.description });
      console.log(`  updated charge ${chargeId}`);
    }
    console.log("  applied.");
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write descriptions.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
