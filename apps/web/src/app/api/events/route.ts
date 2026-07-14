import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { SportEvent } from "@/types";
import { requireAdmin } from "@/lib/auth/server-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/** Accept Firestore Timestamp, Date, or ISO string. */
function toIso(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function serializeEvent(docId: string, data: FirebaseFirestore.DocumentData) {
    return {
        id: docId,
        ...data,
        startTime: toIso(data.startTime),
        endTime: toIso(data.endTime),
        createdAt: toIso(data.createdAt),
        registrationStart: toIso(data.registrationStart),
        registrationEnd: toIso(data.registrationEnd),
        registrationsClosedAt: toIso(data.registrationsClosedAt),
    } as SportEvent;
}

function toTimestamp(value: unknown): Timestamp | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

export async function GET(request: Request) {
    try {
        const adminDb = getAdminDb();
        const adminAuth = getAdminAuth();
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

        const events = snapshot.docs.map((doc) => serializeEvent(doc.id, doc.data()));

        events.sort(
            (a, b) =>
                new Date(a.startTime as unknown as string).getTime() -
                new Date(b.startTime as unknown as string).getTime()
        );

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
        const adminDb = getAdminDb();
        const body = await request.json();

        if (!body.title || !body.sportId || !body.startTime || !body.endTime) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const slug =
            body.slug ||
            String(body.title)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)+/g, "");

        const newEvent = {
            title: body.title,
            description: body.description ?? "",
            category: body.category ?? "MONTHLY_EVENTS",
            sportId: body.sportId,
            locationId: body.locationId ?? null,
            startTime: Timestamp.fromDate(new Date(body.startTime)),
            endTime: Timestamp.fromDate(new Date(body.endTime)),
            capacity: Number(body.capacity ?? 20),
            tokensRequired: Number(body.tokensRequired ?? 0),
            genderPolicy: body.genderPolicy ?? "ALL",
            status: body.status ?? "DRAFT",
            isPublic: body.isPublic ?? true,
            imageUrl: body.imageUrl ?? null,
            addressUrl: body.addressUrl ?? null,
            guestFee: body.guestFee ?? null,
            recurrenceRule: body.recurrenceRule === "NONE" ? null : body.recurrenceRule ?? null,
            registrationStart: toTimestamp(body.registrationStart),
            registrationEnd: toTimestamp(body.registrationEnd),
            customSignupUrl: body.customSignupUrl ?? null,
            registrationFormType: body.registrationFormType ?? null,
            registrationFormId: body.registrationFormId ?? null,
            slug,
            eventLocation: body.eventLocation ?? null,
            ageRestriction: body.ageRestriction ?? null,
            participationLocale: body.participationLocale ?? null,
            registrationFees: body.registrationFees ?? [],
            sponsorshipTiers: body.sponsorshipTiers ?? [],
            historyDetails: body.historyDetails ?? null,
            registrationDeadline: body.registrationDeadline ?? null,
            refundPolicy: body.refundPolicy ?? null,
            tournamentFormat: body.tournamentFormat ?? null,
            teamCap: body.teamCap ?? null,
            prizePool: body.prizePool ?? null,
            prizeNote: body.prizeNote ?? null,
            photoUrls: body.photoUrls ?? [],
            showLocation: body.showLocation ?? true,
            showGender: body.showGender ?? true,
            showAgeRestriction: body.showAgeRestriction ?? true,
            showLocale: body.showLocale ?? true,
            showRegistrationFees: body.showRegistrationFees ?? true,
            showSponsorshipTiers: body.showSponsorshipTiers ?? true,
            showPhotoGallery: body.showPhotoGallery ?? true,
            showHistory: body.showHistory ?? true,
            showRegistrationDeadline: body.showRegistrationDeadline ?? true,
            showRefundPolicy: body.showRefundPolicy ?? true,
            showTournamentFormat: body.showTournamentFormat ?? true,
            showTeamCap: body.showTeamCap ?? true,
            showPrizePool: body.showPrizePool ?? true,
            showDonation: body.showDonation ?? false,
            showRegisteredPlayers: body.showRegisteredPlayers ?? false,
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
