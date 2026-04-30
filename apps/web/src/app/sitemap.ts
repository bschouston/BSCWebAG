import { MetadataRoute } from "next";
import { getAdminDb } from "@/lib/firebase/admin";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticRoutes: MetadataRoute.Sitemap = [
        { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
        { url: `${SITE_URL}/events`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
        { url: `${SITE_URL}/news`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
        { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
        { url: `${SITE_URL}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    ];

    try {
        const adminDb = getAdminDb();
        const [eventsSnap, newsSnap] = await Promise.all([
            adminDb
                .collection("events")
                .where("isPublic", "==", true)
                .where("status", "==", "PUBLISHED")
                .get(),
            adminDb.collection("news").where("published", "==", true).get(),
        ]);

        const eventRoutes: MetadataRoute.Sitemap = eventsSnap.docs.map((doc) => {
            const data = doc.data();
            const slug = data.slug ?? doc.id;
            return {
                url: `${SITE_URL}/events/${slug}`,
                lastModified: data.createdAt?.toDate?.() ?? new Date(),
                changeFrequency: "weekly" as const,
                priority: 0.8,
            };
        });

        const newsRoutes: MetadataRoute.Sitemap = newsSnap.docs.map((doc) => {
            const data = doc.data();
            return {
                url: `${SITE_URL}/news/${doc.id}`,
                lastModified: data.publishedAt?.toDate?.() ?? data.createdAt?.toDate?.() ?? new Date(),
                changeFrequency: "monthly" as const,
                priority: 0.6,
            };
        });

        return [...staticRoutes, ...eventRoutes, ...newsRoutes];
    } catch {
        // Build-time / unauthenticated environments may not have Firebase Admin credentials.
        // Still emit a valid sitemap with static routes.
        return staticRoutes;
    }
}
