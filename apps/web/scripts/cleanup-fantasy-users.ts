/**
 * Wipe Fantasy Google players + tournament fantasy data.
 * Keeps Fantasy password admins, club members/admins, and tablet trackers.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/cleanup-fantasy-users.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/cleanup-fantasy-users.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getClients() {
  if (!getApps().length) {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const raw = path ? readFileSync(path, "utf8") : inline;
    if (!raw?.trim()) throw new Error("Missing Firebase Admin credentials in env");
    initializeApp({
      credential: cert(JSON.parse(raw) as ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    });
  }
  return { db: getFirestore(), auth: getAuth(), storage: getStorage() };
}

function isFantasyPasswordAdmin(data: Record<string, unknown>): boolean {
  return data.isFantasyAdmin === true && data.fantasyAuthType === "password";
}

function isClubRole(role: unknown): boolean {
  return role === "MEMBER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

function hasClubSignals(data: Record<string, unknown>): boolean {
  if (isClubRole(data.role)) return true;
  if (typeof data.itsNumber === "string" && data.itsNumber.trim()) return true;
  if (data.stripeCustomerId || data.stripeCustomerIdTest) return true;
  if (data.defaultPaymentMethodId || data.defaultPaymentMethodIdTest) return true;
  if (typeof data.tokenBalance === "number" && data.tokenBalance > 0) return true;
  if (data.playerProfile) return true;
  return false;
}

type PlannedAction =
  | { uid: string; email: string | null; role: string; action: "keep_admin"; reason: string }
  | { uid: string; email: string | null; role: string; action: "clear_player_flags"; reason: string }
  | { uid: string; email: string | null; role: string; action: "delete"; reason: string }
  | { uid: string; email: string | null; role: string; action: "skip"; reason: string };

async function deleteCollectionDocs(db: Firestore, collectionPath: string): Promise<number> {
  const snap = await db.collection(collectionPath).get();
  let n = 0;
  let batch = db.batch();
  let ops = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops += 1;
    n += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return n;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { db, auth, storage } = getClients();

  const fantasySnap = await db.collection("users").where("isFantasyUser", "==", true).get();
  const plans: PlannedAction[] = [];

  for (const doc of fantasySnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const email = (data.email as string | null) ?? null;
    const role = String(data.role ?? "");

    if (data.isTrackerDevice === true) {
      plans.push({
        uid: doc.id,
        email,
        role,
        action: "skip",
        reason: "tablet tracker — leave alone",
      });
      continue;
    }

    if (isFantasyPasswordAdmin(data)) {
      plans.push({
        uid: doc.id,
        email,
        role,
        action: "keep_admin",
        reason: "Fantasy password admin — keep Auth + doc",
      });
      continue;
    }

    // Google / non-password fantasy players
    if (isClubRole(role) || hasClubSignals(data)) {
      plans.push({
        uid: doc.id,
        email,
        role,
        action: "clear_player_flags",
        reason: "club account with fantasy player flags — clear player fantasy flags only",
      });
      continue;
    }

    plans.push({
      uid: doc.id,
      email,
      role: role || "(none)",
      action: "delete",
      reason: "Fantasy Google player — delete Auth + Firestore user",
    });
  }

  console.log(`Fantasy user plans: ${plans.length}. Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  for (const p of plans) {
    console.log(`- ${p.email ?? "(no email)"} | role=${p.role} | ${p.action} | ${p.reason}`);
  }

  const tournamentsSnap = await db.collection("tournaments").get();
  console.log(`Tournaments to scan for fantasy data: ${tournamentsSnap.size}`);

  if (!apply) {
    console.log("\nRe-run with --apply to perform cleanup.");
    return;
  }

  for (const p of plans) {
    if (p.action === "keep_admin" || p.action === "skip") continue;

    if (p.action === "clear_player_flags") {
      await db.collection("users").doc(p.uid).update({
        isFantasyUser: false,
        fantasyAuthType: null,
        fantasyDisabled: false,
        fantasySessionActive: false,
        updatedAt: Timestamp.now(),
      });
      try {
        const user = await auth.getUser(p.uid);
        const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
        delete claims.fantasy;
        await auth.setCustomUserClaims(p.uid, claims);
      } catch (err) {
        console.warn(`Claims update failed for ${p.uid}`, err);
      }
      console.log(`Cleared fantasy player flags: ${p.email ?? p.uid}`);
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

  let teamsDeleted = 0;
  let fantasyDocsDeleted = 0;
  for (const t of tournamentsSnap.docs) {
    teamsDeleted += await deleteCollectionDocs(db, `tournaments/${t.id}/fantasyTeams`);
    fantasyDocsDeleted += await deleteCollectionDocs(db, `tournaments/${t.id}/fantasy`);
    try {
      const [files] = await storage.bucket().getFiles({ prefix: `fantasy/${t.id}/` });
      await Promise.all(files.map((f) => f.delete().catch(() => undefined)));
      if (files.length) console.log(`Deleted ${files.length} storage objects under fantasy/${t.id}/`);
    } catch (err) {
      console.warn(`Storage cleanup failed for tournament ${t.id}`, err);
    }
  }
  console.log(`Deleted fantasyTeams docs: ${teamsDeleted}`);
  console.log(`Deleted fantasy config docs: ${fantasyDocsDeleted}`);
  console.log("Cleanup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
