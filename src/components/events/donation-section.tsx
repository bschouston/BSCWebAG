"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart-context";
import { HeartHandshake, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function DonationSection({ eventId }: { eventId: string }) {
    const { addToCart } = useCart();
    const [amount, setAmount] = useState<number | "">("");
    const [error, setError] = useState<string | null>(null);
    const [justAdded, setJustAdded] = useState(false);

    const parsed = useMemo(() => (amount === "" ? null : Number(amount)), [amount]);

    useEffect(() => {
        if (!justAdded) return;
        const t = setTimeout(() => setJustAdded(false), 1600);
        return () => clearTimeout(t);
    }, [justAdded]);

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
        setJustAdded(true);
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
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
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

                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="relative flex-1 w-full">
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

                            <motion.div
                                className="shrink-0 w-full sm:w-auto"
                                animate={justAdded ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                                transition={{ duration: 0.35, ease: "easeOut" }}
                            >
                                <Button
                                    type="button"
                                    size="lg"
                                    className={`h-12 w-full sm:w-auto px-8 rounded-full font-bold transition-colors ${
                                        justAdded ? "bg-green-600 hover:bg-green-600 text-white" : ""
                                    }`}
                                    onClick={handleAdd}
                                >
                                    <AnimatePresence mode="wait" initial={false}>
                                        {justAdded ? (
                                            <motion.span
                                                key="added"
                                                className="inline-flex items-center gap-2"
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -4 }}
                                                transition={{ duration: 0.18 }}
                                            >
                                                <Check className="h-5 w-5" />
                                                Added to Cart
                                            </motion.span>
                                        ) : (
                                            <motion.span
                                                key="default"
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -4 }}
                                                transition={{ duration: 0.18 }}
                                            >
                                                Add Donation to Cart
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </Button>
                            </motion.div>
                        </div>

                        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
                    </div>
                </div>
            </div>
        </section>
    );
}

