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

        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.split("Bearer ")[1];
            try {
                const decodedToken = await adminAuth.verifyIdToken(token);
                if (decodedToken.role === "ADMIN" || decodedToken.role === "SUPER_ADMIN") {
                    isAdmin = true;
                } else {
                    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
                    const userData = userDoc.data();
                    if (userData && (userData.role === "ADMIN" || userData.role === "SUPER_ADMIN")) {
                        isAdmin = true;
                    }
                }
            } catch {
                // Invalid token — treat as unauthenticated
            }
        }

        let snapshot;

        if (isAdmin) {
            snapshot = await eventsRef.orderBy("startTime", "asc").get();
        } else {
            try {
                snapshot = await eventsRef
                    .where("isPublic", "==", true)
                    .where("status", "==", "PUBLISHED")
                    .orderBy("startTime", "asc")
                    .get();
            } catch (queryError: any) {
                if (queryError.code === 9 || queryError.message?.includes("index")) {
                    snapshot = await eventsRef
                        .where("isPublic", "==", true)
                        .where("status", "==", "PUBLISHED")
                        .get();
                } else {
                    throw queryError;
                }
            }
        }

        const events = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startTime: data.startTime?.toDate?.()?.toISOString(),
                endTime: data.endTime?.toDate?.()?.toISOString(),
                createdAt: data.createdAt?.toDate?.()?.toISOString(),
                registrationStart: data.registrationStart?.toDate?.()?.toISOString() || null,
                registrationEnd: data.registrationEnd?.toDate?.()?.toISOString() || null,
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
     
    const { error, user } = await requireAdmin(request as any);
    if (error) return error;

    try {
        const body = await request.json();

        if (!body.title || !body.sportId || !body.startTime || !body.endTime) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Allowlist permitted fields to prevent arbitrary Firestore field injection
        const newEvent = {
            title: body.title,
            description: body.description ?? "",
            sportId: body.sportId,
            category: body.category ?? "MONTHLY_EVENTS",
            status: body.status ?? "DRAFT",
            isPublic: body.isPublic ?? false,
            imageUrl: body.imageUrl ?? null,
            location: body.location ?? null,
            maxCapacity: body.maxCapacity ?? null,
            genderPolicy: body.genderPolicy ?? "ALL",
            registrationFormType: body.registrationFormType ?? null,
            customSignupUrl: body.customSignupUrl ?? null,
            registrationFees: body.registrationFees ?? [],
            sponsorshipTiers: body.sponsorshipTiers ?? [],
            showRegistrationFees: body.showRegistrationFees ?? false,
            showSponsorshipTiers: body.showSponsorshipTiers ?? false,
            tags: body.tags ?? [],
            slug: body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""),
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
