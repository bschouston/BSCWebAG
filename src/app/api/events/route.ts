import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { SportEvent } from "@/types";
import { verifyAuth, requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const eventsRef = adminDb.collection("events");
        const authHeader = request.headers.get("Authorization");
        let isAdmin = false;

        console.log("GET /api/events - Checking Auth");

        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.split("Bearer ")[1];
            try {
                const decodedToken = await adminAuth.verifyIdToken(token);
                // Check custom claims first, or fall back to Firestore
                if (decodedToken.role === "ADMIN" || decodedToken.role === "SUPER_ADMIN") {
                    isAdmin = true;
                } else {
                    // Fetch from Firestore to be sure
                    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
                    const userData = userDoc.data();
                    if (userData && (userData.role === "ADMIN" || userData.role === "SUPER_ADMIN")) {
                        isAdmin = true;
                    }
                }
                console.log("User:", decodedToken.uid, "IsAdmin:", isAdmin);
            } catch (e) {
                console.log("Token verification failed:", e);
            }
        } else {
            console.log("No Bearer token found in header");
        }

        console.log("Is Admin Request:", isAdmin);

        let snapshot;

        if (isAdmin) {
            console.log("Fetching ALL events (Admin view)");
            snapshot = await eventsRef.orderBy("startTime", "asc").get();
        } else {
            console.log("Fetching PUBLIC events only");
            try {
                // Try optimized query first (requires index)
                snapshot = await eventsRef
                    .where("isPublic", "==", true)
                    .where("status", "==", "PUBLISHED")
                    .orderBy("startTime", "asc")
                    .get();
            } catch (queryError: any) {
                // Fallback if index is missing: Fetch all public/published and sort in memory
                // error code 9 is FAILED_PRECONDITION (often missing index)
                if (queryError.code === 9 || queryError.message?.includes("index")) {
                    console.warn("Missing Firestore Index. Falling back to memory sort. Error:", queryError.message);
                    snapshot = await eventsRef
                        .where("isPublic", "==", true)
                        .where("status", "==", "PUBLISHED")
                        .get();
                    // We will sort the results in Javascript below to handle the missing index temporarily
                } else {
                    throw queryError;
                }
            }
        }

        console.log(`Found ${snapshot.docs.length} events`);

        let events = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startTime: data.startTime?.toDate?.()?.toISOString(),
                endTime: data.endTime?.toDate?.()?.toISOString(),
                createdAt: data.createdAt?.toDate?.()?.toISOString(),
            } as SportEvent;
        });

        // Ensure sorting (vital for the fallback case)
        events.sort((a, b) => new Date(a.startTime as unknown as string).getTime() - new Date(b.startTime as unknown as string).getTime());

        return NextResponse.json({ events });
    } catch (error) {
        console.error("Error fetching events:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, user } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const body = await request.json();

        // Basic validation
        if (!body.title || !body.sportId || !body.startTime || !body.endTime) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const newEvent = {
            ...body,
            startTime: Timestamp.fromDate(new Date(body.startTime)),
            endTime: Timestamp.fromDate(new Date(body.endTime)),
            registrationStart: body.registrationStart ? Timestamp.fromDate(new Date(body.registrationStart)) : null,
            registrationEnd: body.registrationEnd ? Timestamp.fromDate(new Date(body.registrationEnd)) : null,
            createdAt: Timestamp.now(),
            createdBy: user.uid,
        };

        const res = await adminDb.collection("events").add(newEvent);
        return NextResponse.json({ id: res.id, message: "Event created successfully" });
    } catch (error) {
        console.error("Create event error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
