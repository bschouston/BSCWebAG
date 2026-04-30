"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Users, Clock, Globe } from "lucide-react";

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

function pad2(n: number) {
    return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatRegistrationOpens(registrationStart: Date | null) {
    if (!registrationStart) return null;
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(registrationStart);
}

function deadlineToLocalDate(deadline: string | null | undefined): Date | null {
    if (!deadline) return null;
    // Expecting YYYY-MM-DD from the admin form
    const m = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!year || !month || !day) return null;
    // Local time 11:59 PM (23:59)
    const d = new Date(year, month - 1, day, 23, 59, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatClosesAt(deadlineAt: Date | null) {
    if (!deadlineAt) return null;
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(deadlineAt);
}

export function EventCountdown({
    countdownTo,
    eventStart,
    registrationStart,
    registrationEnd,
    registrationsClosedAt,
    registrationDeadline,
    eventLocation,
    addressUrl,
    genderPolicy,
    ageRestriction,
    participationLocale,
    showLocation = true,
    showGender = true,
    showAgeRestriction = true,
    showLocale = true,
}: {
    countdownTo: "registrationDeadline" | "registrationEnd" | "eventStart";
    eventStart?: TimestampLike;
    registrationEnd?: TimestampLike;
    registrationStart?: TimestampLike;
    registrationsClosedAt?: TimestampLike;
    registrationDeadline?: string | null;
    eventLocation?: string | null;
    addressUrl?: string | null;
    genderPolicy?: "ALL" | "MALE_ONLY" | "FEMALE_ONLY" | string | null;
    ageRestriction?: string | null;
    participationLocale?: string | null;
    showLocation?: boolean;
    showGender?: boolean;
    showAgeRestriction?: boolean;
    showLocale?: boolean;
}) {
    const eventStartDate = useMemo(() => toDate(eventStart), [eventStart]);
    const regStart = useMemo(() => toDate(registrationStart), [registrationStart]);
    const regEnd = useMemo(() => toDate(registrationEnd), [registrationEnd]);
    const closedAt = useMemo(() => toDate(registrationsClosedAt), [registrationsClosedAt]);
    const deadlineAt = useMemo(
        () => deadlineToLocalDate(registrationDeadline),
        [registrationDeadline]
    );

    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const target =
        countdownTo === "registrationDeadline"
            ? deadlineAt
            : countdownTo === "registrationEnd"
            ? regEnd
            : eventStartDate;
    const isHardClosed = !!closedAt;
    const isAfterEnd = !!target && now.getTime() >= target.getTime();
    const showWaitlist =
        !isHardClosed &&
        (countdownTo === "registrationDeadline" || countdownTo === "registrationEnd") &&
        isAfterEnd;

    const isClosed = isHardClosed || (countdownTo === "eventStart" && isAfterEnd);
    const diffMs = target ? target.getTime() - now.getTime() : 0;
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    const closesAtText = formatClosesAt(
        countdownTo === "registrationDeadline" ? deadlineAt : regEnd
    );
    const headline =
        countdownTo === "registrationDeadline" || countdownTo === "registrationEnd"
            ? "Registration ends in"
            : "Event starts in";
    const closedHeadline =
        countdownTo === "registrationDeadline" || countdownTo === "registrationEnd"
            ? showWaitlist
                ? "Waitlist open"
                : "Registration closed"
            : "Event started";

    const genderLabel =
        genderPolicy === "MALE_ONLY"
            ? "Male Only"
            : genderPolicy === "FEMALE_ONLY"
            ? "Female Only"
            : genderPolicy === "ALL"
            ? "All Genders"
            : genderPolicy
            ? String(genderPolicy)
            : null;

    return (
        <Card className="rounded-3xl border-2 shadow-sm overflow-hidden">
            <div className="p-6 md:p-8 bg-card space-y-6">
                <div className="flex flex-col gap-2 items-center text-center">
                    <p className="text-sm text-muted-foreground">{isClosed ? closedHeadline : headline}</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <div className="rounded-2xl border bg-background px-4 py-3 min-w-[92px] text-center">
                            <div className="text-3xl md:text-4xl font-extrabold tabular-nums">
                                {pad2(isClosed ? 0 : days)}
                            </div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                                Days
                            </div>
                        </div>
                        <div className="rounded-2xl border bg-background px-4 py-3 min-w-[92px] text-center">
                            <div className="text-3xl md:text-4xl font-extrabold tabular-nums">
                                {pad2(isClosed ? 0 : hours)}
                            </div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                                Hours
                            </div>
                        </div>
                        <div className="rounded-2xl border bg-background px-4 py-3 min-w-[92px] text-center">
                            <div className="text-3xl md:text-4xl font-extrabold tabular-nums">
                                {pad2(isClosed ? 0 : minutes)}
                            </div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                                Min
                            </div>
                        </div>
                        <div className="rounded-2xl border bg-background px-4 py-3 min-w-[92px] text-center">
                            <div className="text-3xl md:text-4xl font-extrabold tabular-nums">
                                {pad2(isClosed ? 0 : seconds)}
                            </div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                                Sec
                            </div>
                        </div>
                    </div>
                    {closesAtText && (
                        <p className="text-xs text-muted-foreground">
                            {isClosed ? "Registrations closed at:" : showWaitlist ? "Registration ended at:" : "Registrations close at:"}{" "}
                            <span className="font-semibold">{closesAtText}</span>
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2 border-t">
                    {showLocation && (eventLocation || addressUrl) ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground">
                                <MapPin className="w-4 h-4 mr-2" />
                                <span className="text-xs uppercase font-semibold tracking-wider">Location</span>
                            </div>
                            <p className="font-medium">{eventLocation || "Venue"}</p>
                            {addressUrl && (
                                <a
                                    href={addressUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-primary hover:underline font-medium"
                                >
                                    Get Directions
                                </a>
                            )}
                        </div>
                    ) : (
                        <div />
                    )}

                    {showGender && genderLabel ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground">
                                <Users className="w-4 h-4 mr-2" />
                                <span className="text-xs uppercase font-semibold tracking-wider">Gender Policy</span>
                            </div>
                            <p className="font-medium">{genderLabel}</p>
                        </div>
                    ) : (
                        <div />
                    )}

                    {showAgeRestriction && ageRestriction ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground">
                                <Clock className="w-4 h-4 mr-2" />
                                <span className="text-xs uppercase font-semibold tracking-wider">Age Range</span>
                            </div>
                            <p className="font-medium">{ageRestriction}</p>
                        </div>
                    ) : (
                        <div />
                    )}

                    {showLocale && participationLocale ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground">
                                <Globe className="w-4 h-4 mr-2" />
                                <span className="text-xs uppercase font-semibold tracking-wider">Locale</span>
                            </div>
                            <p className="font-medium capitalize">{participationLocale}</p>
                        </div>
                    ) : (
                        <div />
                    )}
                </div>
            </div>
        </Card>
    );
}

