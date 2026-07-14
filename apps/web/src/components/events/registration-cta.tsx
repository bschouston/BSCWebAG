"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type TimestampLike =
    | Date
    | string
    | number
    | null
    | undefined
    | { toDate: () => Date };

function toDate(value: TimestampLike): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
        const d = value.toDate();
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value as any);
    return Number.isNaN(d.getTime()) ? null : d;
}

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
    registrationStart,
    registrationEnd,
    registrationsClosedAt,
    className,
    showWhenNoDeadline = true,
    closedLabel = "Registration closed",
}: {
    registerHref: string;
    registrationDeadline?: string | null;
    registrationStart?: TimestampLike;
    registrationEnd?: TimestampLike;
    registrationsClosedAt?: TimestampLike;
    className?: string;
    showWhenNoDeadline?: boolean;
    closedLabel?: string;
}) {
    const deadlineAt = useMemo(
        () => deadlineToLocalDate(registrationDeadline),
        [registrationDeadline]
    );
    const regStartAt = useMemo(() => toDate(registrationStart), [registrationStart]);
    const regEndAt = useMemo(() => toDate(registrationEnd), [registrationEnd]);
    const closedAt = useMemo(() => toDate(registrationsClosedAt), [registrationsClosedAt]);

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const isHardClosed = !!closedAt;
    const isBeforeOpen = !!regStartAt && now.getTime() < regStartAt.getTime();
    const isAfterEnd =
        !isHardClosed &&
        ((!deadlineAt && !!regEndAt ? now.getTime() >= regEndAt.getTime() : false) ||
            (!!deadlineAt ? now.getTime() >= deadlineAt.getTime() : false));

    if (isHardClosed) {
        return (
            <div className={className}>
                <div className="inline-flex items-center rounded-full border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
                    {closedLabel}
                </div>
            </div>
        );
    }

    if (isBeforeOpen && regStartAt) {
        return (
            <div className={className}>
                <div className="inline-flex flex-col items-start gap-1 rounded-full border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground">
                    <span>Registration opens</span>
                    <span className="font-normal text-xs">{formatCloseAt(regStartAt)}</span>
                </div>
            </div>
        );
    }

    if (!deadlineAt && !regEndAt) {
        if (!showWhenNoDeadline) return null;
        return (
            <Button className={className} size="lg" asChild>
                <Link href={registerHref}>Register Now</Link>
            </Button>
        );
    }

    if (isAfterEnd) {
        return (
            <div className={className}>
                <Button
                    size="lg"
                    className="bg-yellow-500 text-black hover:bg-yellow-400 dark:bg-yellow-400 dark:hover:bg-yellow-300"
                    asChild
                >
                    <Link href={registerHref}>Join waitlist</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className={className}>
            <Button size="lg" asChild>
                <Link href={registerHref}>Register Now</Link>
            </Button>
            {deadlineAt && (
                <div className="mt-2 text-xs text-muted-foreground">
                    Registrations close at:{" "}
                    <span className="font-semibold">{formatCloseAt(deadlineAt)}</span>
                </div>
            )}
        </div>
    );
}

