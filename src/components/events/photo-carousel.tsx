"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoCarouselProps {
    photos: string[];
    title?: string;
}

export function PhotoCarousel({ photos, title }: PhotoCarouselProps) {
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (photos.length <= 1) return;
        const id = window.setInterval(() => {
            setCurrent((c) => (c === photos.length - 1 ? 0 : c + 1));
        }, 10000);
        return () => window.clearInterval(id);
    }, [photos.length]);

    if (!photos.length) return null;

    const prev = () => setCurrent((c) => (c === 0 ? photos.length - 1 : c - 1));
    const next = () => setCurrent((c) => (c === photos.length - 1 ? 0 : c + 1));

    return (
        <section className="space-y-4">
            <h2 className="text-3xl font-bold text-center">Highlights</h2>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-muted select-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={photos[current]}
                    alt={title ? `${title} highlight` : "Event highlight"}
                    className="w-full h-full object-cover transition-opacity duration-300"
                />

                {photos.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={prev}
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/70 hover:bg-background/90 shadow"
                            aria-label="Previous photo"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={next}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/70 hover:bg-background/90 shadow"
                            aria-label="Next photo"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </>
                )}
            </div>
        </section>
    );
}
