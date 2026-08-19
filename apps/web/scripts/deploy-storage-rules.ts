/**
 * Deploy storage.rules via the Firebase Rules REST API.
 *   npx tsx --env-file=.env.local scripts/deploy-storage-rules.ts
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
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!projectId || !bucket) throw new Error("Missing project id or storage bucket");

  const rulesPath = resolve(__dirname, "../../../storage.rules");
  const source = readFileSync(rulesPath, "utf8");
  console.log(`Deploying ${rulesPath} to ${bucket}…`);

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
        files: [{ name: "storage.rules", content: source }],
      },
    },
  });
  const rulesetName = rulesetRes.data.name;
  console.log(`Created ruleset: ${rulesetName}`);

  const releaseName = `projects/${projectId}/releases/firebase.storage/${bucket}`;
  await client.request({
    url: `${base}/releases/firebase.storage/${bucket}`,
    method: "PATCH",
    data: {
      release: { name: releaseName, rulesetName },
    },
  });
  console.log("Storage rules are live.");
}

main().catch((err) => {
  console.error(err?.response?.data ?? err);
  process.exit(1);
});
