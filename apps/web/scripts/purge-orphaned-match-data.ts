/**
 * One-off: purge orphaned tracker audit logs and locks for deleted matches,
 * then rebuild player/team aggregates for every tournament.
 *
 * Dry run (default):
 *   npx tsx --env-file=.env.local scripts/purge-orphaned-match-data.ts
 * Apply:
 *   npx tsx --env-file=.env.local scripts/purge-orphaned-match-data.ts --apply
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { rebuildTournamentAggregates } from "../src/lib/tournament-stats-rebuild";

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

async function deleteRefsInBatches(db: Firestore, refs: DocumentReference[]): Promise<void> {
  let batch = db.batch();
  let ops = 0;
  for (const ref of refs) {
    batch.delete(ref);
    ops += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

function matchIdFromLockDocId(docId: string): string | null {
  // Locks are stored as `{matchId}_A` or `{matchId}_B`
  if (docId.endsWith("_A") || docId.endsWith("_B")) {
    return docId.slice(0, -2);
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  console.log(apply ? "Mode: APPLY (writes enabled)\n" : "Mode: DRY RUN (no writes)\n");

  const tournamentsSnap = await db.collection("tournaments").get();
  const tournamentIds = tournamentsSnap.docs.map((d) => d.id);
  console.log(`Tournaments: ${tournamentIds.length}`);

  /** tournamentId -> set of match ids */
  const matchesByTournament = new Map<string, Set<string>>();
  /** All existing match ids across tournaments (for audits missing tournamentId) */
  const allMatchIds = new Set<string>();

  for (const tid of tournamentIds) {
    const matchesSnap = await db.collection("tournaments").doc(tid).collection("matches").get();
    const ids = new Set(matchesSnap.docs.map((d) => d.id));
    matchesByTournament.set(tid, ids);
    for (const id of ids) allMatchIds.add(id);
    console.log(`  ${tid}: ${ids.size} match(es)`);
  }

  // --- Orphan tracker audit logs ---
  const orphanAuditRefs: DocumentReference[] = [];
  const auditSamples: string[] = [];
  let auditScanned = 0;

  // Paginate by document id to avoid loading unbounded into memory incorrectly
  let lastAuditId: string | undefined;
  for (;;) {
    let q = db.collection("trackerAuditLogs").orderBy("__name__").limit(500);
    if (lastAuditId) {
      q = q.startAfter(db.collection("trackerAuditLogs").doc(lastAuditId));
    }
    const page = await q.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      auditScanned += 1;
      const data = doc.data() as { matchId?: unknown; tournamentId?: unknown };
      const matchId = data.matchId != null ? String(data.matchId).trim() : "";
      if (!matchId) continue; // login/config rows — keep

      const tournamentId =
        data.tournamentId != null ? String(data.tournamentId).trim() : "";

      let orphan = false;
      if (tournamentId && matchesByTournament.has(tournamentId)) {
        orphan = !matchesByTournament.get(tournamentId)!.has(matchId);
      } else if (tournamentId && !matchesByTournament.has(tournamentId)) {
        // Tournament itself gone — audit for a match is orphaned
        orphan = true;
      } else {
        // No tournamentId: orphan if match id does not exist anywhere
        orphan = !allMatchIds.has(matchId);
      }

      if (orphan) {
        orphanAuditRefs.push(doc.ref);
        if (auditSamples.length < 15) {
          auditSamples.push(
            `${doc.id} tournamentId=${tournamentId || "-"} matchId=${matchId}`
          );
        }
      }
    }

    lastAuditId = page.docs[page.docs.length - 1]?.id;
    if (page.size < 500) break;
  }

  console.log(`\ntrackerAuditLogs scanned: ${auditScanned}`);
  console.log(`Orphan audit logs: ${orphanAuditRefs.length}`);
  if (auditSamples.length) {
    console.log("  samples:");
    for (const s of auditSamples) console.log(`    ${s}`);
  }

  // --- Orphan locks ---
  const orphanLockRefs: DocumentReference[] = [];
  const lockSamples: string[] = [];

  for (const tid of tournamentIds) {
    const locksSnap = await db.collection("tournaments").doc(tid).collection("locks").get();
    const matchIds = matchesByTournament.get(tid) ?? new Set<string>();
    for (const doc of locksSnap.docs) {
      const data = doc.data() as { matchId?: unknown };
      const fromField = data.matchId != null ? String(data.matchId).trim() : "";
      const fromId = matchIdFromLockDocId(doc.id);
      const matchId = fromField || fromId || "";
      if (!matchId || matchIds.has(matchId)) continue;
      orphanLockRefs.push(doc.ref);
      if (lockSamples.length < 15) {
        lockSamples.push(`${tid}/locks/${doc.id} (matchId=${matchId})`);
      }
    }
  }

  console.log(`\nOrphan locks: ${orphanLockRefs.length}`);
  if (lockSamples.length) {
    console.log("  samples:");
    for (const s of lockSamples) console.log(`    ${s}`);
  }

  if (!apply) {
    console.log(
      `\nDry run complete. Would delete ${orphanAuditRefs.length} audit log(s) and ${orphanLockRefs.length} lock(s), then rebuild aggregates for ${tournamentIds.length} tournament(s).`
    );
    console.log("Re-run with --apply to write changes.");
    return;
  }

  console.log("\nDeleting orphan audit logs…");
  await deleteRefsInBatches(db, orphanAuditRefs);
  console.log(`  deleted ${orphanAuditRefs.length}`);

  console.log("Deleting orphan locks…");
  await deleteRefsInBatches(db, orphanLockRefs);
  console.log(`  deleted ${orphanLockRefs.length}`);

  console.log("\nRebuilding aggregates…");
  let rebuilt = 0;
  let rebuildErrors = 0;
  for (const tid of tournamentIds) {
    try {
      const result = await rebuildTournamentAggregates(db, tid);
      rebuilt += 1;
      console.log(
        `  ${tid}: players=${result.playersUpdated} teams=${result.teamsUpdated} playsScanned=${result.playsScanned}`
      );
    } catch (err) {
      rebuildErrors += 1;
      console.error(`  ${tid}: FAILED`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone. auditsDeleted=${orphanAuditRefs.length} locksDeleted=${orphanLockRefs.length} tournamentsRebuilt=${rebuilt} rebuildErrors=${rebuildErrors}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
