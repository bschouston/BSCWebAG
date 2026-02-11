import { NewsSection } from "@/components/home/news-section";
import Link from "next/link";
// import { EventCarouselLoader } from "@/components/home/event-carousel-loader";
import { HeroDynamicGrid } from "@/components/home/hero-variations/hero-dynamic-grid";
import { adminDb } from "@/lib/firebase/admin";
import { SportEvent, NewsArticle } from "@/types";

export const dynamic = 'force-dynamic';

async function getHeroData() {
  try {
    const now = new Date();

    // 1. Fetch Upcoming Events (Next 2)
    const eventsSnapshot = await adminDb.collection("events")
      .where("isPublic", "==", true)
      .where("status", "==", "PUBLISHED")
      .where("startTime", ">=", now)
      .orderBy("startTime", "asc")
      .limit(2)
      .get();

    // const upcomingCount = eventsSnapshot.size;
    const upcomingEvents = eventsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      startTime: doc.data().startTime?.toDate?.()?.toISOString(),
      endTime: doc.data().endTime?.toDate?.()?.toISOString(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString(),
    })) as SportEvent[];

    // 2. Fetch Featured Event
    // Prioritize events flagged as FEATURED_EVENTS category
    let featuredEventSnapshot = await adminDb.collection("events")
      .where("isPublic", "==", true)
      .where("status", "==", "PUBLISHED")
      .where("category", "==", "FEATURED_EVENTS")
      .where("startTime", ">=", now)
      .orderBy("startTime", "asc")
      .limit(1)
      .get();

    // Fallback: If no featured event, get the next upcoming event
    if (featuredEventSnapshot.empty) {
      featuredEventSnapshot = await adminDb.collection("events")
        .where("isPublic", "==", true)
        .where("status", "==", "PUBLISHED")
        .where("startTime", ">=", now)
        .orderBy("startTime", "asc")
        .limit(1)
        .get();
    }

    const featuredEvent = featuredEventSnapshot.empty ? null : {
      id: featuredEventSnapshot.docs[0].id,
      ...featuredEventSnapshot.docs[0].data(),
      startTime: featuredEventSnapshot.docs[0].data().startTime?.toDate?.()?.toISOString(),
      endTime: featuredEventSnapshot.docs[0].data().endTime?.toDate?.()?.toISOString(),
      createdAt: featuredEventSnapshot.docs[0].data().createdAt?.toDate?.()?.toISOString(),
    } as SportEvent;


    // 3. Fetch Latest News
    const newsSnapshot = await adminDb.collection("news")
      .where("status", "==", "PUBLISHED")
      .orderBy("publishedAt", "desc")
      .limit(1)
      .get();

    const latestNews = newsSnapshot.empty ? null : {
      id: newsSnapshot.docs[0].id,
      ...newsSnapshot.docs[0].data(),
      publishedAt: newsSnapshot.docs[0].data().publishedAt?.toDate?.()?.toISOString(),
      createdAt: newsSnapshot.docs[0].data().createdAt?.toDate?.()?.toISOString(),
      updatedAt: newsSnapshot.docs[0].data().updatedAt?.toDate?.()?.toISOString(),
    } as NewsArticle;

    return { upcomingEvents, featuredEvent, latestNews };

  } catch (error) {
    console.error("Error fetching hero data:", error);
    return { upcomingEvents: [], featuredEvent: null, latestNews: null };
  }
}

export default async function Home() {
  const { upcomingEvents, featuredEvent, latestNews } = await getHeroData();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Dynamic Grid Hero - Final Selection */}
      <HeroDynamicGrid
        upcomingEvents={upcomingEvents}
        featuredEvent={featuredEvent}
        latestNews={latestNews}
      />

      {/* Upcoming Events Preview Placeholder - Keeping for now as secondary list or remove if redundant? User said "remove hero", implied replacing top part. */}
      {/* If the carousel shows ALL events, the preview list below might be redundant, but helpful as a grid view. I will keep it for now. */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight">All Events</h2>
            <Link href="/events" className="text-primary hover:underline font-medium">View All &rarr;</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-xl bg-card border shadow-sm flex items-center justify-center text-muted-foreground">
                Event Preview Card {i}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dynamic News Section */}
      <NewsSection />
    </div>
  );
}
