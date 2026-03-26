"use client";

import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, Star } from "lucide-react";
import { SponsorshipTier } from "@/types";

interface SponsorshipSectionProps {
    tiers: SponsorshipTier[];
    eventId: string;
    eventTitle: string;
    /** Compact layout for use inside forms */
    compact?: boolean;
}

export function SponsorshipSection({ tiers, eventId, eventTitle, compact = false }: SponsorshipSectionProps) {
    const { items, addToCart, removeFromCart } = useCart();

    const cartId = (tierName: string) =>
        `sponsor_${eventId}_${tierName.toLowerCase().replace(/\s+/g, "_")}`;

    const isInCart = (tierName: string) =>
        items.some(item => item.id === cartId(tierName));

    const handleToggleCart = (tier: SponsorshipTier) => {
        const id = cartId(tier.name);
        if (isInCart(tier.name)) {
            removeFromCart(id);
        } else {
            addToCart({
                id,
                type: "product",
                title: `${eventTitle} — ${tier.name} Sponsorship`,
                amount: tier.cost,
                metadata: { eventId, sponsorTier: tier.name },
            });
        }
    };

    if (tiers.length === 0) return null;

    return (
        <div className={`grid gap-4 ${compact ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
            {tiers.map((tier, idx) => {
                const inCart = isInCart(tier.name);
                const features: string[] = Array.isArray(tier.features)
                    ? tier.features
                    : typeof tier.features === "string"
                    ? (tier.features as string).split(",").map(f => f.trim()).filter(Boolean)
                    : [];

                return (
                    <div
                        key={idx}
                        className={`rounded-2xl p-6 border flex flex-col justify-between transition-all ${
                            inCart
                                ? "bg-primary/5 border-primary shadow-sm"
                                : "bg-card shadow-sm hover:shadow-md"
                        }`}
                    >
                        <div className="space-y-4">
                            <div className="flex justify-between items-start border-b pb-4">
                                <span className="font-bold text-xl text-primary">{tier.name}</span>
                                <span className="font-extrabold text-2xl">${tier.cost}</span>
                            </div>
                            {features.length > 0 && (
                                <ul className="text-sm space-y-2 flex-1">
                                    {features.map((feature, fidx) => (
                                        <li key={fidx} className="flex items-start text-foreground">
                                            <Star className="w-4 h-4 text-primary mr-2 shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <Button
                            type="button"
                            variant={inCart ? "default" : "outline"}
                            className={`w-full mt-6 rounded-xl gap-2 ${
                                !inCart ? "border-primary text-primary hover:bg-primary/10" : ""
                            }`}
                            onClick={() => handleToggleCart(tier)}
                        >
                            {inCart ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    Added — Remove
                                </>
                            ) : (
                                <>
                                    <ShoppingCart className="w-4 h-4" />
                                    Add to Cart
                                </>
                            )}
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}
