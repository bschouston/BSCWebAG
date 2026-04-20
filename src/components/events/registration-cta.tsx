"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function deadlineToLocalDate(deadline: string | null | undefined): Date | null {
    if (!deadline) return null;
    const m = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!year || !month || !day) return null;
    const d = new Date(year, month - 1, day, 23, 59, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatCloseAt(d: Date) {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(d);
}

export function RegistrationCta({
    registerHref,
    registrationDeadline,
    className,
    showWhenNoDeadline = true,
    closedLabel = "Registration closed",
}: {
    registerHref: string;
    registrationDeadline?: string | null;
    className?: string;
    showWhenNoDeadline?: boolean;
    closedLabel?: string;
}) {
    const deadlineAt = useMemo(
        () => deadlineToLocalDate(registrationDeadline),
        [registrationDeadline]
    );

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const isClosed = deadlineAt ? now.getTime() >= deadlineAt.getTime() : false;

    if (!deadlineAt) {
        if (!showWhenNoDeadline) return null;
        return (
            <Button className={className} size="lg" asChild>
                <Link href={registerHref}>Register Now</Link>
            </Button>
        );
    }

    if (isClosed) {
        return (
            <div className={className}>
                <div className="inline-flex items-center rounded-full border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
                    {closedLabel}
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <Button size="lg" asChild>
                <Link href={registerHref}>Register Now</Link>
            </Button>
            <div className="mt-2 text-xs text-muted-foreground">
                Registrations close at:{" "}
                <span className="font-semibold">{formatCloseAt(deadlineAt)}</span>
            </div>
        </div>
    );
}

