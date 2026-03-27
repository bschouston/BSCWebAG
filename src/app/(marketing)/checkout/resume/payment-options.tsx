"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Pencil } from "lucide-react";

interface Props {
    eventId: string;
    registrationId: string;
    eventTitle: string;
    amount: number;
    name: string;
    editUrl: string | null;
}

export default function ResumePaymentOptions({
    eventId,
    registrationId,
    eventTitle,
    amount,
    name,
    editUrl,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePay = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: [
                        {
                            id: `reg_${registrationId}`,
                            type: "registration",
                            title: eventTitle,
                            amount,
                            metadata: { eventId, registrationId },
                        },
                    ],
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create checkout session");
            window.location.href = data.url;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-6">
            {/* Registration summary */}
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Event</span>
                    <span className="font-medium">{eventTitle}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Participant</span>
                    <span className="font-medium">{name || "—"}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Registration Fee</span>
                    <span className="font-bold">${amount.toFixed(2)}</span>
                </div>
            </div>

            <div className="rounded-xl border p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Pay in Full</span>
                </div>
                <span className="text-sm font-medium">${amount.toFixed(2)} today</span>
            </div>

            <Button
                className="w-full h-12 text-base font-semibold"
                size="lg"
                onClick={handlePay}
                disabled={loading}
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Redirecting to Stripe...
                    </>
                ) : (
                    `Pay $${amount.toFixed(2)} in Full`
                )}
            </Button>

            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <p className="text-xs text-center text-muted-foreground">Secured by Stripe</p>

            {editUrl && (
                <div className="border-t pt-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">Need to make changes?</p>
                    <Link href={editUrl}>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3.5 w-3.5" />
                            Edit Registration Details
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
