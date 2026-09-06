/**
 * Remove legacy Google tracker access from Firestore/Auth.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/cleanup-google-trackers.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/cleanup-google-trackers.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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

function hasClubSignals(data: Record<string, unknown>): boolean {
  if (data.role === "MEMBER" || data.role === "ADMIN" || data.role === "SUPER_ADMIN") {
    return true;
  }
  if (data.isFantasyUser === true || data.isFantasyAdmin === true) return true;
  if (typeof data.itsNumber === "string" && data.itsNumber.trim()) return true;
  if (data.stripeCustomerId || data.stripeCustomerIdTest) return true;
  if (data.defaultPaymentMethodId || data.defaultPaymentMethodIdTest) return true;
  if (typeof data.tokenBalance === "number" && data.tokenBalance > 0) return true;
  if (data.playerProfile) return true;
  return false;
}

type PlannedAction =
  | { uid: string; email: string | null; role: string; action: "clear_flags"; reason: string }
  | {
      uid: string;
      email: string | null;
      role: string;
      action: "restore_member_and_clear";
      reason: string;
    }
  | { uid: string; email: string | null; role: string; action: "delete"; reason: string }
  | { uid: string; email: string | null; role: string; action: "skip_tablet"; reason: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, auth } = getClients();

  const googleSnap = await db.collection("users").where("isGoogleTracker", "==", true).get();
  const trackerSnap = await db.collection("users").where("role", "==", "TRACKER").get();

  const byUid = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const doc of googleSnap.docs) {
    byUid.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }
  for (const doc of trackerSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    // Non-tablet TRACKER accounts (legacy Google / public) even if flag cleared.
    if (data.isTrackerDevice !== true) {
      byUid.set(doc.id, { id: doc.id, data });
    }
  }

  const plans: PlannedAction[] = [];

  for (const { id, data } of byUid.values()) {
    const email = (data.email as string | null) ?? null;
    const role = String(data.role ?? "");

    if (data.isTrackerDevice === true) {
      plans.push({
        uid: id,
        email,
        role,
        action: "skip_tablet",
        reason: "tablet device — leave alone",
      });
      continue;
    }

    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      plans.push({
        uid: id,
        email,
        role,
        action: "clear_flags",
        reason: "club admin — clear Google tracker flags only",
      });
      continue;
    }

    if (role === "MEMBER" || hasClubSignals(data)) {
      if (role === "TRACKER" && hasClubSignals(data)) {
        plans.push({
          uid: id,
          email,
          role,
          action: "restore_member_and_clear",
          reason: "former club account rewritten to TRACKER — restore MEMBER + clear flags",
        });
      } else {
        plans.push({
          uid: id,
          email,
          role,
          action: "clear_flags",
          reason: "club member signals — clear Google tracker flags only",
        });
      }
      continue;
    }

    plans.push({
      uid: id,
      email,
      role: role || "(none)",
      action: "delete",
      reason: "non-tablet TRACKER / Google login — delete Auth + Firestore user",
    });
  }

  console.log(`Found ${plans.length} legacy Google/public tracker user(s). Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  for (const p of plans) {
    console.log(`- ${p.email ?? "(no email)"} | role=${p.role} | ${p.action} | ${p.reason}`);
  }

  const allowSnap = await db.collection("trackerAuthorizedEmails").get();
  console.log(`Authorized emails to delete: ${allowSnap.size}`);
  for (const d of allowSnap.docs) {
    const data = d.data() as { email?: string };
    console.log(`  - ${data.email ?? d.id}`);
  }

  const configSnap = await db.doc("trackerAccess/config").get();
  if (configSnap.exists) {
    console.log("trackerAccess/config exists — will delete");
  } else {
    console.log("trackerAccess/config not found");
  }

  if (!apply) {
    console.log("\nRe-run with --apply to perform cleanup.");
    return;
  }

  for (const p of plans) {
    if (p.action === "skip_tablet") continue;

    if (p.action === "clear_flags") {
      await db.collection("users").doc(p.uid).update({
        isGoogleTracker: false,
        trackerDisabled: false,
        trackerSessionActive: false,
        isTrackerAdmin: false,
        updatedAt: Timestamp.now(),
      });
      console.log(`Cleared flags: ${p.email ?? p.uid}`);
      continue;
    }

    if (p.action === "restore_member_and_clear") {
      await db.collection("users").doc(p.uid).update({
        role: "MEMBER",
        isGoogleTracker: false,
        trackerDisabled: false,
        trackerSessionActive: false,
        isTrackerAdmin: false,
        updatedAt: Timestamp.now(),
      });
      try {
        const user = await auth.getUser(p.uid);
        await auth.setCustomUserClaims(p.uid, {
          ...(user.customClaims ?? {}),
          role: "MEMBER",
        });
      } catch (err) {
        console.warn(`Claims update failed for ${p.uid}`, err);
      }
      console.log(`Restored MEMBER + cleared flags: ${p.email ?? p.uid}`);
      continue;
    }

    if (p.action === "delete") {
      try {
        await auth.deleteUser(p.uid);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== "auth/user-not-found") throw err;
      }
      await db.collection("users").doc(p.uid).delete();
      console.log(`Deleted: ${p.email ?? p.uid}`);
    }
  }

  for (const d of allowSnap.docs) {
    await d.ref.delete();
  }
  if (allowSnap.size) console.log(`Deleted ${allowSnap.size} trackerAuthorizedEmails docs`);

  if (configSnap.exists) {
    await configSnap.ref.delete();
    console.log("Deleted trackerAccess/config");
  }

  console.log("Cleanup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
