"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoCarouselProps {
    photos: string[];
    title?: string;
}

export function PhotoCarousel({ photos, title }: PhotoCarouselProps) {
    const [current, setCurrent] = useState(0);

    if (!photos.length) return null;

    const prev = () => setCurrent((c) => (c === 0 ? photos.length - 1 : c - 1));
    const next = () => setCurrent((c) => (c === photos.length - 1 ? 0 : c + 1));

    return (
        <section className="space-y-4">
            <h2 className="text-3xl font-bold">Photo Gallery</h2>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-muted select-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={photos[current]}
                    alt={`${title ?? "Event"} photo ${current + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-300"
                />

                {photos.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={prev}
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/70 hover:bg-background/90 shadow"
                            aria-label="Previous photo"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={next}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/70 hover:bg-background/90 shadow"
                            aria-label="Next photo"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>

                        {/* Dot indicators */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {photos.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrent(i)}
                                    className={`h-2 w-2 rounded-full transition-all ${
                                        i === current
                                            ? "bg-white w-4"
                                            : "bg-white/50 hover:bg-white/80"
                                    }`}
                                    aria-label={`Go to photo ${i + 1}`}
                                />
                            ))}
                        </div>
                    </>
                )}

                <div className="absolute top-3 right-3 text-xs bg-background/70 rounded-full px-2 py-0.5 text-muted-foreground">
                    {current + 1} / {photos.length}
                </div>
            </div>

            {/* Thumbnail strip */}
            {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.map((url, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrent(i)}
                            className={`shrink-0 h-16 w-24 rounded-lg overflow-hidden border-2 transition-all ${
                                i === current ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                            }`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
