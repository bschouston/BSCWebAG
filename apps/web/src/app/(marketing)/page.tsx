import { getAdminDb } from "@/lib/firebase/admin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
    let slug: string | null = null;

    try {
        const adminDb = getAdminDb();
        // Single equality filter — no composite index needed
        const snap = await adminDb
            .collection("events")
            .where("registrationFormType", "==", "volleyball")
            .limit(1)
            .get();

        if (!snap.empty) {
            const data = snap.docs[0].data();
            slug = data.slug || snap.docs[0].id;
        }

        if (!slug) {
            const featured = await adminDb
                .collection("events")
                .where("category", "==", "FEATURED_EVENTS")
                .limit(1)
                .get();

            if (!featured.empty) {
                const data = featured.docs[0].data();
                slug = data.slug || featured.docs[0].id;
            }
        }
    } catch (err: any) {
        // In local/dev/build contexts we may not have Firebase Admin credentials.
        // Fall back to /events without spamming the dev server logs.
        const msg = String(err?.message ?? err);
        if (!msg.includes("Firebase Admin credentials not set")) {
            console.error("Homepage redirect query error:", err);
        }
    }

    // redirect() is called outside try/catch so Next.js can handle its
    // internal NEXT_REDIRECT throw without it being swallowed.
    redirect(slug ? `/events/${slug}` : "/events");
}
