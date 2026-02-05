import * as React from "react";
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
}

// The individual card component with hover animation
const OfferCard = React.forwardRef<HTMLAnchorElement, OfferCardProps>(({ offer }, ref) => (
    <motion.a
        ref={ref}
        href={offer.href}
        className="relative flex-shrink-0 w-[300px] h-[380px] rounded-2xl overflow-hidden group snap-start block"
        whileHover={{ y: -8 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        style={{ perspective: "1000px" }}
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
}

// The main carousel component with scroll functionality
const OfferCarousel = React.forwardRef<HTMLDivElement, OfferCarouselProps>(
    ({ offers, className, ...props }, ref) => {
        const scrollContainerRef = React.useRef<HTMLDivElement>(null);

        const scroll = (direction: "left" | "right") => {
            if (scrollContainerRef.current) {
                const { current } = scrollContainerRef;
                const scrollAmount = current.clientWidth * 0.8; // Scroll by 80% of the container width
                current.scrollBy({
                    left: direction === "left" ? -scrollAmount : scrollAmount,
                    behavior: "smooth",
                });
            }
        };

        if (!offers || offers.length === 0) {
            return null;
        }

        return (
            <div ref={ref} className={cn("relative w-full group py-8", className)} {...props}>
                {/* Left Scroll Button */}
                <button
                    onClick={() => scroll("left")}
                    className="absolute top-1/2 -translate-y-1/2 left-4 z-10 w-12 h-12 rounded-full bg-background/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-background/50 hover:scale-110 disabled:opacity-0"
                    aria-label="Scroll Left"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                {/* Scrollable Container */}
                <div
                    ref={scrollContainerRef}
                    className="flex space-x-6 overflow-x-auto px-4 pb-4 scrollbar-hide snap-x snap-mandatory items-stretch"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {offers.map((offer) => (
                        <OfferCard key={offer.id} offer={offer} />
                    ))}
                </div>

                {/* Right Scroll Button */}
                <button
                    onClick={() => scroll("right")}
                    className="absolute top-1/2 -translate-y-1/2 right-4 z-10 w-12 h-12 rounded-full bg-background/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-background/50 hover:scale-110 disabled:opacity-0"
                    aria-label="Scroll Right"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>
        );
    }
);
OfferCarousel.displayName = "OfferCarousel";

export { OfferCarousel, OfferCard };
