"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Tag, Calendar, MapPin, ArrowRight } from "lucide-react";
import { Offer } from "@/components/ui/offer-carousel";
import { Player } from "@remotion/player";
import { EventPromo } from "@/remotion/EventPromo";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface HeroCarouselProps {
    offers: Offer[];
}

export function HeroCarousel({ offers }: HeroCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Auto-advance
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % offers.length);
        }, 8000); // 8 seconds per slide
        return () => clearInterval(timer);
    }, [offers.length]);

    const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % offers.length);
    const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + offers.length) % offers.length);

    if (!offers.length) return null;

    const currentOffer = offers[currentIndex];

    // Check if this specific offer has video enabled
    // We added useVideoBanner to SportEvent, but we need to pass it through to Offer.
    // For now, let's assume if the Offer has a specific tag or we update Offer interface.
    // I will update Offer interface in a moment, but for now accessing dynamically.
    const useVideo = (currentOffer as any).useVideoBanner;

    return (
        <div className="relative w-full h-[600px] overflow-hidden bg-black group">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7 }}
                    className="absolute inset-0"
                >
                    {useVideo ? (
                        <div className="w-full h-full">
                            <Player
                                component={EventPromo}
                                durationInFrames={240} // 8 seconds at 30fps
                                compositionWidth={1920}
                                compositionHeight={1080}
                                fps={30}
                                style={{
                                    width: "100%",
                                    height: "100%"
                                }}
                                inputProps={{
                                    title: currentOffer.title,
                                    date: currentOffer.promoCode || "", // Using promoCode field for date string hack or update Offer
                                    imageUrl: currentOffer.imageSrc,
                                    sportName: currentOffer.tag,
                                    location: "Burhani Sports Club"
                                }}
                                autoPlay
                                loop
                                controls={false}
                            />
                            {/* Overlay Gradient for text legibility at bottom */}
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
                        </div>
                    ) : (
                        <>
                            <img
                                src={currentOffer.imageSrc}
                                alt={currentOffer.imageAlt}
                                className="w-full h-full object-cover opacity-60"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                        </>
                    )}

                    {/* Content Overlay */}
                    <div className="absolute inset-0 flex flex-col justify-end pb-16 px-4 md:px-16 max-w-7xl mx-auto pointer-events-none">
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="pointer-events-auto max-w-3xl"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <span className="bg-primary text-white px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide">
                                    {currentOffer.tag}
                                </span>
                                <span className="text-white/80 flex items-center gap-2 text-sm font-medium bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                                    <Tag className="w-4 h-4" /> Featured Event
                                </span>
                            </div>

                            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
                                {currentOffer.title}
                            </h1>

                            <p className="text-lg md:text-xl text-gray-200 mb-8 max-w-2xl line-clamp-3">
                                {currentOffer.description}
                            </p>

                            <div className="flex flex-wrap gap-4">
                                <Button size="lg" className="rounded-full text-lg h-12 px-8" asChild>
                                    <Link href={currentOffer.href}>
                                        Register Now <ArrowRight className="ml-2 w-5 h-5" />
                                    </Link>
                                </Button>
                                {!useVideo && ( // Link to details if not registering directly
                                    <Button size="lg" variant="outline" className="rounded-full text-lg h-12 px-8 bg-transparent text-white border-white hover:bg-white hover:text-black" asChild>
                                        <Link href={`/events/${currentOffer.id}`}>
                                            View Details
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Navigation Buttons (Only if multiple) */}
            {offers.length > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all opacity-0 group-hover:opacity-100"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>

                    {/* Indicators */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                        {offers.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                className={`h-1.5 rounded-full transition-all ${idx === currentIndex ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/60"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
