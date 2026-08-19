
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Initialize Admin SDK locally for seeding
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY not found in env.");
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKey);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

const db = getFirestore();

async function seed() {
    const events = [
        {
            title: "Weekly Badminton Night",
            description: "Join us for our regular Friday badminton session!",
            category: "WEEKLY_SPORTS",
            sportId: "badminton",
            startTime: Timestamp.fromDate(new Date(Date.now() + 86400000)), // Tomorrow
            endTime: Timestamp.fromDate(new Date(Date.now() + 90000000)),
            capacity: 32,
            tokensRequired: 1,
            genderPolicy: "ALL",
            status: "PUBLISHED",
            isPublic: true,
            createdAt: Timestamp.now(),
        },
        {
            title: "Ladies Volleyball Training",
            description: "Coaching session for beginners.",
            category: "WEEKLY_SPORTS",
            sportId: "volleyball",
            startTime: Timestamp.fromDate(new Date(Date.now() + 172800000)),
            endTime: Timestamp.fromDate(new Date(Date.now() + 180000000)),
            capacity: 20,
            tokensRequired: 1,
            genderPolicy: "FEMALE_ONLY",
            status: "PUBLISHED",
            isPublic: true,
            createdAt: Timestamp.now(),
        }
    ];

    console.log("Seeding events...");

    for (const event of events) {
        const res = await db.collection("events").add(event);
        console.log(`Created event: ${res.id}`);
    }

    console.log("Done.");
}

seed().catch(console.error);
