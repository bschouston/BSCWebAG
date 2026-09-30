/**
 * Cup registration API smoke (no player, no card payment).
 *   npx tsx --env-file=.env.local scripts/smoke-cup-registration-checkout.ts
 *
 * Creates a pending_payment draft, calls /api/checkout, asserts Stripe URL, deletes draft.
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CUP_EVENT_ID = "QaCMISN2NnvRaMgi5PZS";
const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";

function getDb() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials");
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return getFirestore();
}

async function main() {
  const email = `cup-smoke-test+${Date.now()}@burhanisportsclub.com`;
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  console.log("BASE", BASE);
  console.log("event", CUP_EVENT_ID);

  const t0 = Date.now();
  const regRes = await fetch(`${BASE}/api/events/${CUP_EVENT_ID}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Mr",
      firstName: "Cup",
      lastName: "SmokeTest",
      email,
      isDraft: true,
      paymentStatus: "pending_payment",
      playerPhotoUrl: tinyPng,
      agreementSignature: tinyPng,
      waiverSignature: tinyPng,
    }),
  });
  const regMs = Date.now() - t0;
  const regBody = await regRes.json().catch(() => ({}));
  console.log("register", regRes.status, `${regMs}ms`, regBody);
  if (!regRes.ok || !regBody.id) {
    throw new Error(`Register failed: ${JSON.stringify(regBody)}`);
  }
  if (regMs > 15000) {
    console.warn("WARN: register took >15s — possible hang regression");
  }

  const regId = String(regBody.id);
  const t1 = Date.now();
  const checkoutRes = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          id: `reg_${regId}`,
          type: "registration",
          title: "North American Cup 1448H",
          amount: 153,
          metadata: { eventId: CUP_EVENT_ID, registrationId: regId },
        },
      ],
      cancelUrl: `${BASE}/checkout/resume?eventId=${CUP_EVENT_ID}&registrationId=${regId}`,
      customerEmail: email,
    }),
  });
  const checkoutMs = Date.now() - t1;
  const checkoutBody = await checkoutRes.json().catch(() => ({}));
  console.log("checkout", checkoutRes.status, `${checkoutMs}ms`, {
    url: typeof checkoutBody.url === "string" ? checkoutBody.url.slice(0, 60) + "…" : null,
    error: checkoutBody.error,
  });

  const db = getDb();
  await db
    .collection("events")
    .doc(CUP_EVENT_ID)
    .collection("event_registrations")
    .doc(regId)
    .delete();
  console.log("deleted draft", regId);

  if (!checkoutRes.ok || typeof checkoutBody.url !== "string") {
    throw new Error(`Checkout failed: ${JSON.stringify(checkoutBody)}`);
  }
  if (!checkoutBody.url.includes("checkout.stripe.com")) {
    throw new Error(`Unexpected checkout URL: ${checkoutBody.url}`);
  }
  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
