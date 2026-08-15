import { HeroSection } from "@/components/home/hero-section";
import { EventCarouselLoader } from "@/components/home/event-carousel-loader";
import { HistoricalHighlights } from "@/components/home/historical-highlights";
import { NewsSection } from "@/components/home/news-section";

export function ClubHomePage() {
  return (
    <div className="relative text-[#1a3556] dark:text-white">
      <div aria-hidden className="home-glow" />
      <div className="relative z-[1]">
        <HeroSection />
        <EventCarouselLoader />
        <HistoricalHighlights />
        <NewsSection />
      </div>
    </div>
  );
}
