import * as React from "react";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight, Tag } from "lucide-react";
import { cn } from "@/lib/utils"; // Your utility for merging Tailwind classes

// Define the type for a single offer item
export interface Offer {
    id: string | number;
    imageSrc: string;
    imageAlt: string;
    tag: string;
    title: string;
    description: string;
    brandLogoSrc: string;
    brandName: string;
    promoCode?: string;
    href: string;
}

// Props for the OfferCard component
interface OfferCardProps {
    offer: Offer;
    fullWidth?: boolean;
}

const OfferCard = React.forwardRef<HTMLAnchorElement, OfferCardProps>(({ offer, fullWidth }, ref) => (
    <motion.a
        ref={ref}
        href={offer.href}
        className={cn(
            "relative block shrink-0 overflow-hidden rounded-2xl group snap-start",
            fullWidth ? "h-[min(52vh,420px)] w-full min-w-full" : "h-[380px] w-[300px]"
        )}
        whileHover={fullWidth ? undefined : { y: -8 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
        {/* Background Image */}
        <img
            src={offer.imageSrc}
            alt={offer.imageAlt}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Gradient Overlay for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        {/* Card Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col justify-end h-full">
            <div className="space-y-2 mb-4">
                {/* Tag */}
                <div className="flex items-center text-xs font-medium text-white/90">
                    <Tag className="w-4 h-4 mr-2 text-primary" />
                    <span className="uppercase tracking-wider">{offer.tag}</span>
                </div>
                {/* Title & Description */}
                <h3 className="text-xl font-bold text-white leading-tight">{offer.title}</h3>
                <p className="text-sm text-gray-300 line-clamp-2">{offer.description}</p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-white/20">
                <div className="flex items-center gap-3">
                    {offer.brandLogoSrc && (
                        <img src={offer.brandLogoSrc} alt={`${offer.brandName} logo`} className="w-8 h-8 rounded-full bg-white/10 p-1 backdrop-blur-sm" />
                    )}
                    <div>
                        <p className="text-xs font-semibold text-white">{offer.brandName}</p>
                        {offer.promoCode && (
                            <p className="text-xs text-primary font-mono">{offer.promoCode}</p>
                        )}
                    </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white transform transition-transform duration-300 group-hover:rotate-[-45deg] group-hover:bg-primary group-hover:text-primary-foreground">
                    <ArrowRight className="w-4 h-4" />
                </div>
            </div>
        </div>
    </motion.a>
));
OfferCard.displayName = "OfferCard";

// Props for the OfferCarousel component
export interface OfferCarouselProps extends React.HTMLAttributes<HTMLDivElement> {
    offers: Offer[];
    variant?: "strip" | "full";
}

const OfferCarousel = React.forwardRef<HTMLDivElement, OfferCarouselProps>(
    ({ offers, className, variant = "strip", ...props }, ref) => {
        const scrollContainerRef = useRef<HTMLDivElement>(null);
        const fullWidth = variant === "full";
        const pausedRef = useRef(false);

        const scroll = (direction: "left" | "right") => {
            const current = scrollContainerRef.current;
            if (!current) return;
            const scrollAmount = fullWidth ? current.clientWidth : current.clientWidth * 0.8;
            current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
        };

        const advance = () => {
            const el = scrollContainerRef.current;
            if (!el || pausedRef.current) return;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 12;
            if (atEnd) {
                el.scrollTo({ left: 0, behavior: "smooth" });
            } else {
                scroll("right");
            }
        };

        useEffect(() => {
            if (!fullWidth || offers.length < 2) return;
            const id = window.setInterval(advance, 4000);
            return () => window.clearInterval(id);
        }, [fullWidth, offers.length]);

        if (!offers || offers.length === 0) {
            return null;
        }

        return (
            <div
                ref={ref}
                className={cn("relative w-full group", fullWidth ? "py-2" : "py-8", className)}
                onMouseEnter={() => {
                    pausedRef.current = true;
                }}
                onMouseLeave={() => {
                    pausedRef.current = false;
                }}
                {...props}
            >
                {offers.length > 1 ? (
                <button
                    onClick={() => scroll("left")}
                    className="absolute top-1/2 left-2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#FFD700]/50 bg-[#1a3556]/80 text-[#FFD700] opacity-100 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#1a3556] sm:left-4 md:opacity-0 md:group-hover:opacity-100"
                    aria-label="Scroll Left"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                ) : null}

                <div
                    ref={scrollContainerRef}
                    className={cn(
                        "flex overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory items-stretch",
                        fullWidth ? "gap-0" : "space-x-6 px-4"
                    )}
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    {offers.map((offer) => (
                        <OfferCard key={offer.id} offer={offer} fullWidth={fullWidth} />
                    ))}
                </div>

                {offers.length > 1 ? (
                <button
                    onClick={() => scroll("right")}
                    className="absolute top-1/2 right-2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#FFD700]/50 bg-[#1a3556]/80 text-[#FFD700] opacity-100 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#1a3556] sm:right-4 md:opacity-0 md:group-hover:opacity-100"
                    aria-label="Scroll Right"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
                ) : null}
            </div>
        );
    }
);
OfferCarousel.displayName = "OfferCarousel";

export { OfferCarousel, OfferCard };
