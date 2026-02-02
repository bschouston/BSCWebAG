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
        try {
            const serviceAccount = JSON.parse(serviceAccountKey) as ServiceAccount;
            return initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID,
            });
        } catch (error) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY", error);
            // Fallback or throw? Next.js edge runtime might find this tricky if not careful
            // For now, let's just use default app or mock if needed for build
        }
    }

    // If no service key (e.g. during build without secrets), 
    // we might want to initialize with applicationDefault() if running in GCP,
    // or just throw an error if this is critical.
    // For local dev without secret, this will fail if called.
    return initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

const adminApp = getAdminApp();
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

export { adminApp, adminAuth, adminDb };
