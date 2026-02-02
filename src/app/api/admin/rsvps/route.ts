import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await requireAdmin(request as any);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");

    if (!eventId) {
        return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    try {
        const rsvpsQuery = await adminDb.collection("event_rsvps")
            .where("eventId", "==", eventId)
            .orderBy("createdAt", "desc") // Show newest first or order by waitlist?
            .get();

        const rsvps = await Promise.all(rsvpsQuery.docs.map(async (docSnapshot) => {
            const data = docSnapshot.data();

            // Enrich with user data
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

        return NextResponse.json({ rsvps });
    } catch (error) {
        console.error("Fetch RSVPs error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
