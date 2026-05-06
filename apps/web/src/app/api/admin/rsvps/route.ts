import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
     
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    const adminDb = getAdminDb();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");
    const includeArchived = searchParams.get("includeArchived") === "1";

    if (!eventId) {
        return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    try {
        const eventDoc = await adminDb.collection("events").doc(eventId).get();
        const eventData = eventDoc.data();

        const normalizeRegistrationStatus = (
            statusValue: unknown,
            paymentStatusValue: unknown
        ): string => {
            const rawStatus = (typeof statusValue === "string" ? statusValue : "").trim();
            const rawPayment = (typeof paymentStatusValue === "string" ? paymentStatusValue : "").trim();

            const upperStatus = rawStatus ? rawStatus.toUpperCase() : "";
            const upperPayment = rawPayment ? rawPayment.toUpperCase() : "";

            if (upperStatus === "WAITLIST" || upperStatus === "WAITLISTED") return "WAITLISTED";
            if (upperStatus === "CANCELLED" || upperStatus === "CANCELED") return "CANCELLED";
            if (upperStatus === "CONFIRMED") return "CONFIRMED";

            // Backward-compat: some historical waitlist signups only have paymentStatus.
            if (
                upperPayment === "WAITLISTED_NO_PAYMENT" ||
                upperPayment.includes("WAITLIST")
            ) {
                return "WAITLISTED";
            }

            if (!upperStatus) return "CONFIRMED";
            return upperStatus;
        };

        // 1. Fetch Standard RSVPs — wrapped independently so a missing Firestore index
        //    doesn't prevent custom form registrations from loading.
        let rsvps: any[] = [];
        try {
            const rsvpsQuery = await adminDb.collection("event_rsvps")
                .where("eventId", "==", eventId)
                .orderBy("createdAt", "desc")
                .get();

            rsvps = await Promise.all(rsvpsQuery.docs.map(async (docSnapshot) => {
                const data = docSnapshot.data();

                let userData = null;
                if (data.userId) {
                    const userDoc = await adminDb.collection("users").doc(data.userId).get();
                    if (userDoc.exists) {
                        const u = userDoc.data();
                        userData = {
                            firstName: u?.firstName,
                            lastName: u?.lastName,
                            email: u?.email,
                            skillLevels: u?.skillLevels || {},
                            photoURL: u?.photoURL
                        };
                    }
                }

                return {
                    id: docSnapshot.id,
                    ...data,
                    user: userData,
                    createdAt: data.createdAt?.toDate?.()?.toISOString(),
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString()
                };
            }));
        } catch (rsvpError: any) {
            // Missing composite index or other RSVP query error — log and continue
            console.warn("Standard RSVPs query failed (possibly missing index):", rsvpError?.message);
        }

        let allRsvps = [...rsvps];

        // 2. Fetch Custom Registrations unconditionally, because an event can have both.
        // Even if registrationFormType wasn't explicitly set, if they submitted via the custom form, it's in the DB.
        const registrationsQuery = await adminDb.collection("events")
            .doc(eventId)
            .collection("event_registrations")
            .orderBy("registeredAt", "desc")
            .get();

        const customRsvps = registrationsQuery.docs
        .filter((docSnapshot) => {
            const d = docSnapshot.data();
            if (d.isDraft) return false;
            if (!includeArchived && d.archivedAt) return false;
            return true;
        })
        .map(docSnapshot => {
            const data = docSnapshot.data();
            return {
                id: docSnapshot.id,
                eventId: eventId,
                status: normalizeRegistrationStatus(data.status, data.paymentStatus),
                attended: false,
                waitlistPosition: null,
                user: {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    photoURL: null,
                    skillLevels: { [eventData?.sportId || "volleyball"]: data.playFrequency || "Unknown" },
                },
                createdAt: data.registeredAt?.toDate?.()?.toISOString(),
                updatedAt: data.registeredAt?.toDate?.()?.toISOString(),
                customDetails: data // Attached for extended data viewing
            };
        });
        allRsvps = [...allRsvps, ...customRsvps];

        // Sort combined list by created date descending
        allRsvps.sort((a, b) => {
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return NextResponse.json({ rsvps: allRsvps });
    } catch (error) {
        console.error("Fetch RSVPs error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
