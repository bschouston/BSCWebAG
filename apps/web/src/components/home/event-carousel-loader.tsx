"use client";

import { useEffect, useState } from "react";
import { OfferCarousel, type Offer } from "@/components/ui/offer-carousel";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { SportEvent } from "@/types";
import { Loader2 } from "lucide-react";

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
                            href: event.customSignupUrl || `/events/${event.id}`,
                            // @ts-ignore - dynamic extension
                            useVideoBanner: event.useVideoBanner
                        };

                        if (event.category === "FEATURED_EVENTS" || event.category === "MONTHLY_EVENTS") {
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
            <div className="w-full h-[600px] flex items-center justify-center bg-muted/10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (heroOffers.length === 0 && weeklyOffers.length === 0) {
        return (
            <div className="w-full py-24 text-center text-foreground">
                <h2 className="text-3xl font-bold">Welcome to Burhani Sports Club</h2>
                <p className="mt-4 text-muted-foreground">Check back soon for upcoming events!</p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col gap-12 pb-12">
            {/* Hero Section (Featured/Monthly) */}
            {heroOffers.length > 0 && (
                <HeroCarousel offers={heroOffers} />
            )}

            {/* Weekly Strip */}
            {weeklyOffers.length > 0 && (
                <div className="max-w-7xl mx-auto px-4 w-full">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-8 w-1 bg-primary rounded-full" />
                        <h2 className="text-2xl font-bold">Weekly Sports</h2>
                    </div>
                    <OfferCarousel offers={weeklyOffers} />
                </div>
            )}
        </div>
    );
}
