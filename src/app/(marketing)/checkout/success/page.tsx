"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function CheckoutSuccessPage() {
    const { clearCart } = useCart();
    const searchParams = useSearchParams();

    useEffect(() => {
        const sessionId = searchParams.get("session_id");

        // Verify payment with Stripe and update Firestore registration statuses
        if (sessionId) {
            fetch("/api/checkout/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId }),
            }).catch(err => console.error("Payment verification error:", err));
        }

        clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-green-100 dark:bg-green-900/30 w-24 h-24 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2 text-center">Payment Successful!</h1>
            <p className="text-muted-foreground mb-8 text-center max-w-md">
                Thank you for your purchase. Your registration has been confirmed and a receipt has been sent to your email.
            </p>
            <div className="flex gap-4 flex-wrap justify-center">
                <Link href="/events">
                    <Button size="lg">Browse More Events</Button>
                </Link>
                <Link href="/">
                    <Button variant="outline" size="lg">Go Home</Button>
                </Link>
            </div>
        </div>
    );
}
