/**
 * One-off: reconcile a registration whose Stripe payment succeeded but whose
 * success redirect / webhook never marked it paid.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/reconcile-unpaid-registration.ts "Mohammed" "Salim"
 * Apply:
 *   npx tsx --env-file=.env.local scripts/reconcile-unpaid-registration.ts "Mohammed" "Salim" --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

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
  const [firstName = "Mohammed", lastName = "Salim"] = process.argv
    .slice(2)
    .filter((a) => a !== "--apply");
  const apply = process.argv.includes("--apply");

  const db = getDb();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover" as any,
  });

  // 1. Find matching registrations across all events
  const eventsSnap = await db.collection("events").get();
  const matches: {
    eventId: string;
    eventTitle: string;
    registrationId: string;
    data: Record<string, unknown>;
  }[] = [];

  for (const eventDoc of eventsSnap.docs) {
    const regsSnap = await eventDoc.ref.collection("event_registrations").get();
    for (const regDoc of regsSnap.docs) {
      const data = regDoc.data();
      if (
        String(data.firstName ?? "").trim().toLowerCase() === firstName.toLowerCase() &&
        String(data.lastName ?? "").trim().toLowerCase() === lastName.toLowerCase()
      ) {
        matches.push({
          eventId: eventDoc.id,
          eventTitle: String(eventDoc.data().title ?? eventDoc.id),
          registrationId: regDoc.id,
          data,
        });
      }
    }
  }

  if (!matches.length) {
    console.log(`No registrations found for ${firstName} ${lastName}.`);
    return;
  }

  console.log(`Found ${matches.length} registration(s) for ${firstName} ${lastName}:`);
  for (const m of matches) {
    console.log(
      `- event "${m.eventTitle}" (${m.eventId}) reg ${m.registrationId}: ` +
        `status=${m.data.status ?? "?"} paymentStatus=${m.data.paymentStatus ?? "?"} isDraft=${m.data.isDraft ?? false}`
    );
  }

  // 2. Find recent paid checkout sessions referencing these registrations
  const regIds = new Set(matches.map((m) => m.registrationId));
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });

  for (const session of sessions.data) {
    const meta = session.metadata?.registrations;
    if (!meta) continue;
    let parsed: { eventId: string; registrationId: string }[];
    try {
      parsed = JSON.parse(meta);
    } catch {
      continue;
    }
    for (const { eventId, registrationId } of parsed) {
      if (!regIds.has(registrationId)) continue;

      const amountPaid = (session.amount_total ?? 0) / 100;
      console.log(
        `\nStripe session ${session.id}: payment_status=${session.payment_status} ` +
          `amount=$${amountPaid} livemode=${session.livemode} created=${new Date(session.created * 1000).toISOString()}`
      );

      if (session.payment_status !== "paid") {
        console.log("  -> not paid; skipping");
        continue;
      }

      const match = matches.find((m) => m.registrationId === registrationId)!;
      if (match.data.receiptStripeSession === session.id) {
        console.log("  -> already reconciled with this session; skipping");
        continue;
      }

      if (!apply) {
        console.log(
          `  -> DRY RUN: would mark reg ${registrationId} (event ${eventId}) paid/CONFIRMED`
        );
        continue;
      }

      await db
        .collection("events")
        .doc(eventId)
        .collection("event_registrations")
        .doc(registrationId)
        .update({
          isDraft: false,
          status: "CONFIRMED",
          paymentStatus: "paid",
          paymentType: "full",
          receiptStripeSession: session.id,
          stripeLivemode: session.livemode,
          stripeAmountPaid: amountPaid,
        });
      console.log(`  -> APPLIED: reg ${registrationId} marked paid/CONFIRMED`);
    }
  }

  if (!apply) console.log("\nDry run complete. Re-run with --apply to write changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
