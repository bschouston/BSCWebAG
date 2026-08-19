"use client";

import { useEffect, useState } from "react";
import { OfferCarousel, type Offer } from "@/components/ui/offer-carousel";
import { SportEvent } from "@/types";
import { Loader2 } from "lucide-react";
import { eventPagePath } from "@/lib/calendar-urls";

export function EventCarouselLoader() {
    const [heroOffers, setHeroOffers] = useState<Offer[]>([]);
    const [weeklyOffers, setWeeklyOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch("/api/events");
                const data = await res.json();

                if (data.events) {
                    const rawEvents: SportEvent[] = data.events;

                    const hero: Offer[] = [];
                    const weekly: Offer[] = [];

                    rawEvents.forEach(event => {
                        const offer: Offer = {
                            id: event.id,
                            imageSrc: event.imageUrl || "/images/placeholder-sport.jpg",
                            imageAlt: event.title,
                            tag: event.category.replace("_", " "),
                            title: event.title,
                            description: event.description || `Join us for ${event.title}!`,
                            brandLogoSrc: "", // Removed complicated logic
                            brandName: "BSC Events",
                            promoCode: event.startTime ? new Date(event.startTime as any).toLocaleDateString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                            }) : "", // Use promoCode field to carry formatting date string for now
                            href: event.customSignupUrl || eventPagePath(event),
                            detailsHref: eventPagePath(event),
                            // @ts-ignore - dynamic extension
                            useVideoBanner: event.useVideoBanner
                        };

                        if (event.category === "FEATURED_EVENTS") {
                            hero.push(offer);
                        } else {
                            weekly.push(offer);
                        }
                    });

                    // Sort Hero: Featured first, then by date
                    hero.sort((a, b) => {
                        if (a.tag.includes("FEATURED") && !b.tag.includes("FEATURED")) return -1;
                        if (!a.tag.includes("FEATURED") && b.tag.includes("FEATURED")) return 1;
                        // @ts-ignore
                        return 0; // Simplified sort
                    });

                    setHeroOffers(hero);
                    setWeeklyOffers(weekly);
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
            <div className="flex h-40 w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#c8102e] dark:text-[#FFD700]" />
            </div>
        );
    }

    if (heroOffers.length === 0 && weeklyOffers.length === 0) {
        return null;
    }

    return (
        <div className="relative z-10 flex w-full flex-col gap-12 py-14">
            {heroOffers.length > 0 && (
                <div className="container mx-auto px-4">
                    <div className="mb-6 flex items-center gap-4">
                        <div className="h-8 w-1 rounded-full bg-[#c8102e]" />
                        <h2 className="text-2xl font-bold">Happening Now</h2>
                    </div>
                    <OfferCarousel offers={heroOffers} variant="full" />
                </div>
            )}

            {weeklyOffers.length > 0 && (
                <div className="container mx-auto px-4">
                    <div className="mb-6 flex items-center gap-4">
                        <div className="h-8 w-1 rounded-full bg-[#FFD700]" />
                        <h2 className="text-2xl font-bold">Weekly sports</h2>
                    </div>
                    <OfferCarousel offers={weeklyOffers} />
                </div>
            )}
        </div>
    );
}
