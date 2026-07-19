/**
 * Deploy firestore.rules via the Firebase Rules REST API using the Admin
 * service account (no firebase-tools login required).
 *
 *   npx tsx --env-file=.env.local scripts/deploy-firestore-rules.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

async function main() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ??
    (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH
      ? readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH, "utf8")
      : "");
  if (!raw.trim()) throw new Error("Missing Firebase Admin credentials in env");
  const credentials = JSON.parse(raw);
  const projectId = process.env.FIREBASE_PROJECT_ID ?? credentials.project_id;
  if (!projectId) throw new Error("Missing project id");

  const rulesPath = resolve(__dirname, "../../../firestore.rules");
  const source = readFileSync(rulesPath, "utf8");
  console.log(`Deploying ${rulesPath} to project ${projectId}…`);

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/firebase"],
  });
  const client = await auth.getClient();
  const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;

  const rulesetRes = await client.request<{ name: string }>({
    url: `${base}/rulesets`,
    method: "POST",
    data: {
      source: {
        files: [{ name: "firestore.rules", content: source }],
      },
    },
  });
  const rulesetName = rulesetRes.data.name;
  console.log(`Created ruleset: ${rulesetName}`);

  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  await client.request({
    url: `${base}/releases/cloud.firestore`,
    method: "PATCH",
    data: {
      release: { name: releaseName, rulesetName },
    },
  });
  console.log("Release updated — Firestore rules are live.");
}

main().catch((err) => {
  console.error(err?.response?.data ?? err);
  process.exit(1);
});
