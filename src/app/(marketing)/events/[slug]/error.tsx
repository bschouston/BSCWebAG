"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function EventError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Event page error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
            <div className="bg-red-100 dark:bg-red-900/30 w-20 h-20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Failed to load event</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
                We couldn&apos;t load this event. This might be a temporary issue — please try again.
            </p>
            <div className="flex gap-3">
                <Button onClick={reset}>Try again</Button>
                <Button variant="outline" asChild>
                    <Link href="/events">Browse all events</Link>
                </Button>
            </div>
        </div>
    );
}
