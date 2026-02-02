
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

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
            title: "Men's Volleyball Tournament",
            description: "Monthly inter-club volleyball tournament.",
            category: "MONTHLY_EVENTS",
            sportId: "volleyball",
            startTime: Timestamp.fromDate(new Date(Date.now() + 604800000)), // Next week
            endTime: Timestamp.fromDate(new Date(Date.now() + 612000000)),
            capacity: 48,
            tokensRequired: 2,
            genderPolicy: "MALE_ONLY",
            status: "PUBLISHED",
            isPublic: true,
            createdAt: Timestamp.now(),
        },
        {
            title: "Ladies Futsal Training",
            description: "Coaching session for beginners.",
            category: "WEEKLY_SPORTS",
            sportId: "futsal",
            startTime: Timestamp.fromDate(new Date(Date.now() + 172800000)), // Day after tomorrow
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
        const res = await adminDb.collection("events").add(event);
        console.log(`Created event: ${res.id}`);
    }

    console.log("Done.");
}

seed().catch(console.error);
