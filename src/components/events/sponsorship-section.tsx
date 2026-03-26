"use client";

import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star, Plus, Minus } from "lucide-react";
import { SponsorshipTier } from "@/types";

interface SponsorshipSectionProps {
    tiers: SponsorshipTier[];
    eventId: string;
    eventTitle: string;
    /** Compact layout for use inside forms */
    compact?: boolean;
    /**
     * When provided the component is embedded inside a registration form.
     * Uses quantity controls instead of cart buttons.
     * selections maps tier name → quantity chosen (0 = not selected).
     */
    formMode?: {
        selections: Record<string, number>;
        onIncrement: (tier: SponsorshipTier) => void;
        onDecrement: (tier: SponsorshipTier) => void;
    };
}

export function SponsorshipSection({ tiers, eventId, eventTitle, compact = false, formMode }: SponsorshipSectionProps) {
    const { items, addToCart, removeFromCart, decrementCartItem } = useCart();

    const cartId = (tierName: string) =>
        `sponsor_${eventId}_${tierName.toLowerCase().replace(/\s+/g, "_")}`;

    const cartQty = (tierName: string) =>
        items.find(item => item.id === cartId(tierName))?.quantity ?? 0;

    const handleIncrement = (tier: SponsorshipTier) => {
        addToCart({
            id: cartId(tier.name),
            type: "product",
            title: `${eventTitle} — ${tier.name} Sponsorship`,
            amount: tier.cost,
            metadata: { eventId, sponsorTier: tier.name },
        });
    };

    const handleDecrement = (tier: SponsorshipTier) => {
        decrementCartItem(cartId(tier.name));
    };

    if (tiers.length === 0) return null;

    return (
        <div className={`grid gap-4 ${compact ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`}>
            {tiers.map((tier, idx) => {
                const qty = formMode
                    ? (formMode.selections[tier.name] ?? 0)
                    : cartQty(tier.name);
                const active = qty > 0;

                const features: string[] = Array.isArray(tier.features)
                    ? tier.features
                    : typeof tier.features === "string"
                    ? (tier.features as string).split(",").map(f => f.trim()).filter(Boolean)
                    : [];

                return (
                    <div
                        key={idx}
                        className={`rounded-2xl p-6 border flex flex-col justify-between transition-all ${
                            active
                                ? "bg-primary/5 border-primary shadow-sm"
                                : "bg-card shadow-sm hover:shadow-md"
                        }`}
                    >
                        <div className="space-y-4">
                            <div className="flex justify-between items-start border-b pb-4">
                                <span className="font-bold text-xl text-primary">{tier.name}</span>
                                <div className="text-right">
                                    <span className="font-extrabold text-2xl">${tier.cost}</span>
                                    {qty > 1 && (
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            ${(tier.cost * qty).toFixed(0)} total
                                        </p>
                                    )}
                                </div>
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

                        {qty === 0 ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full mt-6 rounded-xl gap-2 border-primary text-primary hover:bg-primary/10"
                                onClick={() => formMode ? formMode.onIncrement(tier) : handleIncrement(tier)}
                            >
                                {formMode ? <Plus className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                                {formMode ? "Add Sponsorship" : "Add to Cart"}
                            </Button>
                        ) : (
                            <div className="mt-6 flex items-center justify-between gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-10 rounded-xl shrink-0"
                                    onClick={() => formMode ? formMode.onDecrement(tier) : handleDecrement(tier)}
                                >
                                    <Minus className="w-4 h-4" />
                                </Button>
                                <div className="flex-1 text-center">
                                    <span className="text-xl font-bold">{qty}</span>
                                    <p className="text-xs text-muted-foreground">
                                        ${(tier.cost * qty).toFixed(2)}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="default"
                                    size="icon"
                                    className="h-10 w-10 rounded-xl shrink-0"
                                    onClick={() => formMode ? formMode.onIncrement(tier) : handleIncrement(tier)}
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
