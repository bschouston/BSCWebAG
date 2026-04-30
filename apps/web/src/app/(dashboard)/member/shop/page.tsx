"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Zap, Star } from "lucide-react";

export default function ShopPage() {
    const tokenPackages = [
        { id: "starter", name: "Starter Pack", tokens: 10, price: 15, popular: false },
        { id: "pro", name: "Pro Pack", tokens: 25, price: 35, popular: true },
        { id: "elite", name: "Elite Pack", tokens: 50, price: 60, popular: false },
    ];

    const subscriptions = [
        {
            id: "auto-20",
            name: "Auto-Replenish 20",
            description: "Automatically add 20 tokens when balance options below 5.",
            price: "28/month",
            features: ["20 Tokens Monthly", "Rollover Unused Tokens", "10% Discount on Events"]
        },
        {
            id: "auto-50",
            name: "Auto-Replenish 50",
            description: "Automatically add 50 tokens when balance options below 10.",
            price: "55/month",
            features: ["50 Tokens Monthly", "Rollover Unused Tokens", "15% Discount on Events", "Priority Booking"]
        }
    ];

    const handlePurchase = (id: string, type: "onetime" | "subscription") => {
        // Placeholder for Stripe Checkout integration
        console.log(`Initiating checkout for ${type} - ${id}`);
        alert("Payment integration coming soon!");
    };

    return (
        <div className="space-y-10">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Token Shop</h1>
                <p className="text-muted-foreground mt-2">
                    Purchase tokens for event registrations or subscribe for automatic refills.
                </p>
            </div>

            {/* One-time Purchase Section */}
            <section>
                <div className="flex items-center gap-2 mb-6">
                    <Coins className="h-6 w-6 text-yellow-500" />
                    <h2 className="text-2xl font-semibold">Top Up Tokens</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {tokenPackages.map((pack) => (
                        <Card key={pack.id} className={`relative flex flex-col ${pack.popular ? 'border-primary shadow-md' : ''}`}>
                            {pack.popular && (
                                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
                            )}
                            <CardHeader className="text-center pb-8 pt-10">
                                <CardTitle className="text-xl">{pack.name}</CardTitle>
                                <div className="text-4xl font-bold mt-4">
                                    ${pack.price}
                                </div>
                                <CardDescription className="text-foreground/80 font-medium mt-2">
                                    {pack.tokens} Tokens
                                </CardDescription>
                                <p className="text-xs text-muted-foreground mt-1">
                                    ${(pack.price / pack.tokens).toFixed(2)} per token
                                </p>
                            </CardHeader>
                            <CardFooter className="mt-auto">
                                <Button className="w-full" onClick={() => handlePurchase(pack.id, "onetime")}>
                                    Buy Now
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </section>

            {/* Subscription Section */}
            <section>
                <div className="flex items-center gap-2 mb-6">
                    <Zap className="h-6 w-6 text-blue-500" />
                    <h2 className="text-2xl font-semibold">Auto-Replenish Subscriptions</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
                    {subscriptions.map((sub) => (
                        <Card key={sub.id} className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="text-xl">{sub.name}</CardTitle>
                                <CardDescription>{sub.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-4">
                                <div className="text-3xl font-bold">
                                    ${sub.price}
                                </div>
                                <ul className="space-y-2 text-sm">
                                    {sub.features.map((feature, i) => (
                                        <li key={i} className="flex items-center">
                                            <Star className="mr-2 h-4 w-4 text-green-500" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full" onClick={() => handlePurchase(sub.id, "subscription")}>
                                    Subscribe
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
}
