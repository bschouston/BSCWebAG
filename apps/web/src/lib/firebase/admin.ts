import "server-only";
import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

// Helper to get admin app instance
export function getAdminApp() {
    if (getApps().length > 0) {
        return getApp();
    }

    const serviceAccountKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
    const serviceAccountKeyInline = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    const serviceAccountRaw =
        serviceAccountKeyPath?.trim()
            ? readFileSync(serviceAccountKeyPath, "utf8")
            : serviceAccountKeyInline;

    if (serviceAccountRaw?.trim()) {
        let serviceAccount: ServiceAccount;
        try {
            serviceAccount = JSON.parse(serviceAccountRaw) as ServiceAccount;
        } catch (error) {
            throw new Error(
                (serviceAccountKeyPath?.trim()
                    ? "FIREBASE_SERVICE_ACCOUNT_KEY_PATH points to invalid JSON. "
                    : "FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON. ") +
                "Ensure the value is the full service account JSON object."
            );
        }
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
    }

    throw new Error(
        "Firebase Admin credentials not set. " +
        "Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH to a JSON file path (recommended on Plesk), " +
        "or set FIREBASE_SERVICE_ACCOUNT_KEY to the full service account JSON string."
    );
}

export function getAdminAuth() {
    return getAuth(getAdminApp());
}

export function getAdminDb() {
    return getFirestore(getAdminApp());
}
