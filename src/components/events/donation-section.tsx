"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart-context";
import { HeartHandshake } from "lucide-react";

export function DonationSection({ eventId }: { eventId: string }) {
    const { addToCart } = useCart();
    const [amount, setAmount] = useState<number | "">("");
    const [error, setError] = useState<string | null>(null);

    const parsed = useMemo(() => (amount === "" ? null : Number(amount)), [amount]);

    const handleAdd = () => {
        setError(null);
        const amt = parsed ?? 0;
        if (!Number.isFinite(amt) || amt <= 0) {
            setError("Enter a donation amount greater than $0.");
            return;
        }
        addToCart({
            id: `donation_${eventId}`,
            type: "product",
            title: "Donate to Burhani Sports Club",
            amount: amt,
            quantity: 1,
            metadata: { donation: true, eventId },
        });
        setAmount(amt);
    };

    return (
        <section className="rounded-3xl border-2 border-primary/20 shadow-sm overflow-hidden bg-primary/5">
            <div className="p-8 md:p-10 space-y-6">
                <div className="text-center space-y-2">
                    <h3 className="text-3xl font-bold flex items-center justify-center gap-2">
                        <HeartHandshake className="w-7 h-7 text-primary" />
                        Donate to Burhani Sports Club
                    </h3>
                    <p className="text-muted-foreground">
                        Support our mission of community, connection, and khidmat.
                    </p>
                </div>

                <div className="text-sm text-muted-foreground leading-relaxed space-y-4 max-w-3xl mx-auto">
                    <p>
                        Burhani Sports Club is built on more than sports — it is built on community, connection, and
                        khidmat. Your donation helps us continue that mission in ways that reach far beyond the game
                        itself.
                    </p>
                    <p>
                        Not every event or initiative has the same level of funding, and your generosity helps us
                        bridge those gaps so that meaningful programs can continue without compromise. Donations
                        support niyaz at events, help us send mumineen to KUN, and make many other acts of khidmat
                        possible throughout the year.
                    </p>
                    <p>
                        By giving to BSC, you are helping create spaces where people can gather, participate, and
                        benefit together. You are helping us serve where needed most, support our community with
                        dignity, and keep these efforts moving forward. Every donation is a chance to be part of
                        something larger — a shared commitment to service, unity, and barakat.
                    </p>
                </div>

                <div className="max-w-xl mx-auto w-full">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 rounded-full px-4"
                                    onClick={() => {
                                        setError(null);
                                        setAmount(21);
                                    }}
                                >
                                    $21
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 rounded-full px-4"
                                    onClick={() => {
                                        setError(null);
                                        setAmount(53);
                                    }}
                                >
                                    $53
                                </Button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    $
                                </span>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    min={1}
                                    step="1"
                                    value={amount}
                                    onChange={(e) =>
                                        setAmount(e.target.value === "" ? "" : Number(e.target.value))
                                    }
                                    className="pl-7 h-12 text-base"
                                    placeholder="Enter amount"
                                />
                            </div>
                            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                        </div>
                        <Button
                            type="button"
                            size="lg"
                            className="h-12 px-8 rounded-full font-bold"
                            onClick={handleAdd}
                        >
                            Add Donation to Cart
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}

