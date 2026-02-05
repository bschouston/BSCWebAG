import { EventCarouselLoader } from "@/components/home/event-carousel-loader";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Dynamic Event Carousel Hero */}
      <section className="bg-gradient-to-b from-background to-muted/20 min-h-[500px] flex flex-col justify-center">
        <EventCarouselLoader />
      </section>

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

      {/* Latest News Preview Placeholder */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Latest News</h2>
            <Link href="/news" className="text-primary hover:underline font-medium">Read More &rarr;</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-muted border flex items-center justify-center text-muted-foreground">
                News Article {i}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
