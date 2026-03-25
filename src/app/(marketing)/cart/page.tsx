"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Trash2, ShoppingCart, Loader2 } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default function CartPage() {
    const { items, removeFromCart, totalAmount, clearCart } = useCart();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCheckout = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create checkout session");
            window.location.href = data.url;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setLoading(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
                <div className="bg-muted w-24 h-24 rounded-full flex items-center justify-center mb-6">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Your Cart is Empty</h1>
                <p className="text-muted-foreground mb-8 text-center max-w-md">
                    You haven't added anything to your cart yet. Check out our upcoming events and register!
                </p>
                <Link href="/events">
                    <Button size="lg">Browse Events</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Shopping Cart</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cart Items List */}
                <div className="lg:col-span-2 space-y-4">
                    {items.map((item) => (
                        <Card key={item.id} className="overflow-hidden">
                            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                                            {item.type}
                                        </span>
                                    </div>
                                    <h3 className="font-semibold text-lg">{item.title}</h3>
                                    {item.metadata?.eventId && (
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm text-muted-foreground">Event ID: {item.metadata.eventId}</p>
                                            {item.type === 'registration' && (
                                                <Link href={`/register/volleyball?eventId=${item.metadata.eventId}&edit=${item.metadata.registrationId}`}>
                                                    <Button variant="link" size="sm" className="h-auto p-0 text-xs">Edit Registration</Button>
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-6 self-end sm:self-auto mt-4 sm:mt-0">
                                    <span className="text-lg font-bold">
                                        ${item.amount.toFixed(2)}
                                    </span>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => removeFromCart(item.id)}
                                        aria-label="Remove item"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    <div className="flex justify-end pt-4">
                        <Button variant="outline" onClick={clearCart}>
                            Clear Cart
                        </Button>
                    </div>
                </div>

                {/* Order Summary */}
                <div className="lg:col-span-1">
                    <Card className="sticky top-24">
                        <CardHeader>
                            <CardTitle>Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
                                <span>${totalAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Taxes</span>
                                <span>Calculated at checkout</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total</span>
                                <span>${totalAmount.toFixed(2)}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-3">
                            <Button
                                className="w-full text-lg h-12"
                                size="lg"
                                onClick={handleCheckout}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Redirecting to Stripe...
                                    </>
                                ) : (
                                    "Proceed to Checkout"
                                )}
                            </Button>
                            {error && (
                                <p className="text-sm text-destructive text-center">{error}</p>
                            )}
                        </CardFooter>
                        <div className="px-6 pb-6 text-xs text-center text-muted-foreground">
                            Secured by Stripe
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
