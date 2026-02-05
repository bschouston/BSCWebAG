"use client";

import { useEffect, useState } from "react";
import { OfferCarousel, type Offer } from "@/components/ui/offer-carousel";
import { SportEvent } from "@/types";
import { Loader2 } from "lucide-react";

export function EventCarouselLoader() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch("/api/events");
                const data = await res.json();

                if (data.events) {
                    const rawEvents: SportEvent[] = data.events;

                    // Sort by Priority: FEATURED > MONTHLY > WEEKLY
                    // Also consider creating specific priority map
                    const priorityMap: Record<string, number> = {
                        "FEATURED_EVENTS": 3,
                        "MONTHLY_EVENTS": 2,
                        "WEEKLY_SPORTS": 1
                    };

                    const sortedEvents = rawEvents.sort((a, b) => {
                        const priorityA = priorityMap[a.category] || 0;
                        const priorityB = priorityMap[b.category] || 0;
                        if (priorityA !== priorityB) {
                            return priorityB - priorityA; // Descending priority
                        }
                        // Secondary sort: Date (Ascending - soonest first)
                        return new Date(a.startTime as unknown as string).getTime() - new Date(b.startTime as unknown as string).getTime();
                    });

                    // Map to Offer interface
                    const mappedOffers: Offer[] = sortedEvents.map(event => ({
                        id: event.id,
                        imageSrc: event.imageUrl || "/images/placeholder-sport.jpg", // Ensure there's a fallback in public folder or use external placeholder
                        imageAlt: event.title,
                        tag: event.category.replace("_", " "),
                        title: event.title,
                        description: event.description || `Join us for ${event.title}!`,
                        brandLogoSrc: getSportIcon(event.sportId), // Simple helper
                        brandName: "BSC Events",
                        promoCode: event.guestFee ? `$${event.guestFee} Guest` : "Members Only",
                        href: event.customSignupUrl || `/events/${event.id}`
                    }));

                    setOffers(mappedOffers);
                }
            } catch (error) {
                console.error("Failed to load carousel events", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEvents();
    }, []);

    if (loading) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-muted/10 rounded-xl">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (offers.length === 0) {
        // Fallback hero if no events? Or just nothing? 
        // User asked to replace hero, so maybe show a default welcome card if empty
        return (
            <div className="w-full py-12 text-center text-white">
                <h2 className="text-2xl font-bold">Welcome to Burhani Sports Club</h2>
                <p className="mt-2 text-white/80">Check back soon for upcoming events!</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl mx-auto px-4 py-8">
            <OfferCarousel offers={offers} />
        </div>
    );
}

function getSportIcon(sportId: string): string {
    // Return a generic icon or specific logical URL based on sport
    // For now, using a placeholder/logo logic
    // You might want to replace this with actual assets
    return "https://ui-avatars.com/api/?name=BSC&background=0D8ABC&color=fff";
}
