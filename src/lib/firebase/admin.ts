import "server-only";
import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Helper to get admin app instance
function getAdminApp() {
    if (getApps().length > 0) {
        return getApp();
    }

    // Check if we have the service account key
    // In production, this might be a JSON string in an env var
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
        let serviceAccount: ServiceAccount;
        try {
            serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
        } catch (error) {
            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON. " +
                "Ensure the environment variable is set to the full service account JSON string."
            );
        }
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
    }

    throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_KEY is not set. " +
        "Set this environment variable to the Firebase service account JSON string."
    );
}

const adminApp = getAdminApp();
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

export { adminApp, adminAuth, adminDb };
