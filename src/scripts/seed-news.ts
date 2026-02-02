
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

try {
    const trimmedKey = serviceAccountKey.trim();
    const serviceAccount = JSON.parse(trimmedKey);

    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} catch (e: any) {
    console.error("Failed to parse JSON:", e.message);
    process.exit(1);
}

const db = getFirestore();

async function seedNews() {
    const articles = [
        {
            title: "Club Championship Results 2025",
            excerpt: "The annual badminton championship concluded with thrilling matches. See the winners here.",
            content: "The Burhani Sports Club held its annual badminton championship this past weekend. With over 50 participants, it was our biggest event yet. Congratulations to Huzaifa Mehdi for taking home the gold in Men's Singles! Special thanks to our volunteers for making this happen.",
            authorId: "admin",
            status: "PUBLISHED",
            publishedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        },
        {
            title: "New Gym Equipment Arriving Soon",
            excerpt: "We are upgrading our fitness center with state-of-the-art weights and treadmills.",
            content: "We are excited to announce a major upgrade to our gym facilities. Expected to arrive by mid-February, the new equipment includes Technogym treadmills, a full set of dumbbells up to 100lbs, and a new squat rack. The gym will remain open during installation with minor interruptions.",
            authorId: "admin",
            status: "PUBLISHED",
            publishedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        },
        {
            title: "Ramadan Sports Schedule",
            excerpt: "Adjusted timings for all sports activities during the holy month.",
            content: "In observance of Ramadan, all sports activities will shift to post-Iftar timings. Cricket and Volleyball will commence at 10:00 PM on weekends. Badminton courts will be available for booking from 9:30 PM to 1:00 AM daily. Please check the events page for specific session details.",
            authorId: "admin",
            status: "PUBLISHED",
            publishedAt: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        }
    ];

    console.log("Seeding news...");

    for (const article of articles) {
        const res = await db.collection("news").add(article);
        console.log(`Created article: ${res.id}`);
    }

    console.log("Done.");
}

seedNews().catch(console.error);
