"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, CalendarRange, Loader2, Info, Pencil } from "lucide-react";

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
    const [selected, setSelected] = useState<"full" | "installment">("full");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const monthly = amount / 3;

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
                    paymentType: selected,
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

            {/* Payment option toggle */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => setSelected("full")}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm transition-all ${
                        selected === "full"
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                >
                    <CreditCard className={`h-5 w-5 ${selected === "full" ? "text-primary" : ""}`} />
                    <span className="font-semibold">Pay in Full</span>
                    <span className="text-xs">${amount.toFixed(2)} today</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSelected("installment")}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm transition-all ${
                        selected === "installment"
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                >
                    <CalendarRange className={`h-5 w-5 ${selected === "installment" ? "text-primary" : ""}`} />
                    <span className="font-semibold">3 Payments</span>
                    <span className="text-xs">${monthly.toFixed(2)}/mo</span>
                </button>
            </div>

            {/* Installment breakdown */}
            {selected === "installment" && (
                <Card className="border-primary/20">
                    <CardContent className="pt-4 pb-3 space-y-2 text-sm">
                        <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                            <Info className="h-3.5 w-3.5 text-primary" />
                            Monthly Installment Plan
                        </div>
                        {[
                            { label: "Today", amount: monthly },
                            { label: "In 30 days", amount: monthly },
                            { label: "In 60 days", amount: monthly },
                        ].map(({ label, amount: a }) => (
                            <div key={label} className="flex justify-between text-muted-foreground">
                                <span>{label}</span>
                                <span className="font-medium text-foreground">${a.toFixed(2)}</span>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground pt-1 border-t">
                            Charged automatically to your card. No action needed for months 2 &amp; 3.
                        </p>
                    </CardContent>
                </Card>
            )}

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
                ) : selected === "installment" ? (
                    `Pay $${monthly.toFixed(2)} Now`
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
