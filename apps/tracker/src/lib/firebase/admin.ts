import "server-only";
import { initializeApp, getApps, getApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

export function getAdminApp() {
  if (getApps().length > 0) return getApp();

  const serviceAccountKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  const serviceAccountKeyInline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  const serviceAccountRaw =
    serviceAccountKeyPath?.trim()
      ? readFileSync(serviceAccountKeyPath, "utf8")
      : serviceAccountKeyInline;

  if (serviceAccountRaw?.trim()) {
    const serviceAccount = JSON.parse(serviceAccountRaw) as ServiceAccount;
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  throw new Error(
    "Firebase Admin credentials not set. " +
      "Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH to a JSON file path, " +
      "or set FIREBASE_SERVICE_ACCOUNT_KEY to the full service account JSON string."
  );
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

