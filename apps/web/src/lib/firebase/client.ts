import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Important for monorepos + Next build:
 * This module can be evaluated during server-side build/prerender. Avoid initializing
 * the Firebase Web SDK unless we're in the browser where NEXT_PUBLIC_* env vars exist.
 */
const isBrowser = typeof window !== "undefined";

const app = isBrowser
    ? (!getApps().length ? initializeApp(firebaseConfig) : getApp())
    : null;

// Exported for convenience in client components. These are only valid in the browser.
const auth = app ? getAuth(app) : (null as any);
const db = app ? getFirestore(app) : (null as any);
const storage = app ? getStorage(app) : (null as any);

export { app, auth, db, storage };
