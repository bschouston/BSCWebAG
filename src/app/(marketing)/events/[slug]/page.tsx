import { adminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Calendar, Clock, Users, Globe, History, Image as ImageIcon, Trophy, ShieldAlert, Layers } from "lucide-react";
import { PhotoCarousel } from "@/components/events/photo-carousel";
import Link from "next/link";
import type { Metadata } from "next";
import { DonationSection } from "@/components/events/donation-section";
import { FeaturedEventNav } from "@/components/events/featured-event-nav";
import { EventCountdown } from "@/components/events/event-countdown";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";

function toIsoStringOrNull(value: any): string | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof value === "object" && typeof value.toDate === "function") {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    // Firestore Admin Timestamp sometimes shows as {_seconds,_nanoseconds}
    if (typeof value === "object" && typeof value._seconds === "number") {
        const d = new Date(value._seconds * 1000);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
}

function ageFromDob(dob: string | undefined | null) {
    if (!dob) return null;
    const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (!month || !day || !year) return null;
    const birth = new Date(year, month - 1, day);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear =
        now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age >= 0 && age <= 120 ? age : null;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    try {
        const slugQuery = await adminDb
            .collection("events")
            .where("slug", "==", slug)
            .limit(1)
            .get();
        const doc = slugQuery.empty
            ? await adminDb.collection("events").doc(slug).get()
            : slugQuery.docs[0];

        if (!doc.exists) return {};

        const data = doc.data() as SportEvent & Record<string, any>;
        const title = `${data.title} — Burhani Sports Club`;
        const description = (data.description as string | undefined)?.slice(0, 160) ?? title;
        const image = data.imageUrl ?? undefined;

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                url: `${SITE_URL}/events/${slug}`,
                images: image ? [{ url: image }] : [],
                type: "website",
            },
            twitter: {
                card: "summary_large_image",
                title,
                description,
                images: image ? [image] : [],
            },
        };
    } catch {
        return {};
    }
}

 
function formatEventDateRange(startTimestamp: any, endTimestamp?: any) {
    if (!startTimestamp) return "TBD";
     
    const startDate = typeof startTimestamp.toDate === 'function' ? startTimestamp.toDate() : new Date(startTimestamp as any);
    if (isNaN(startDate.getTime())) return "TBD";

    const startStr = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(startDate);

    if (!endTimestamp) return startStr;

     
    const endDate = typeof endTimestamp.toDate === 'function' ? endTimestamp.toDate() : new Date(endTimestamp as any);
    if (isNaN(endDate.getTime())) return startStr;

    const isSameDay = startDate.toDateString() === endDate.toDateString();
    if (isSameDay) {
        return startStr;
    } else {
        // e.g. "July 25 - 26, 2026" when month/year are same
        if (
            startDate.getFullYear() === endDate.getFullYear() &&
            startDate.getMonth() === endDate.getMonth()
        ) {
            const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(startDate);
            return `${month} ${startDate.getDate()} - ${endDate.getDate()}, ${startDate.getFullYear()}`;
        }

        const endStr = new Intl.DateTimeFormat('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        }).format(endDate);
        return `${startStr} - ${endStr}`;
    }
}

export default async function EventLandingPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    let eventData: SportEvent | null = null;
    let eventId = slug;

    // Query by slug first, fallback to doc ID. Throw on Firestore error so
    // the error.tsx boundary catches it (rather than silently showing a 404).
    const slugQuery = await adminDb.collection("events").where("slug", "==", slug).limit(1).get();
    if (!slugQuery.empty) {
        const doc = slugQuery.docs[0];
        eventData = { id: doc.id, ...doc.data() } as unknown as SportEvent;
        eventId = doc.id;
    } else {
        const doc = await adminDb.collection("events").doc(slug).get();
        if (doc.exists) {
            eventData = { id: doc.id, ...doc.data() } as unknown as SportEvent;
        }
    }

    if (!eventData || !eventData.isPublic || eventData.status !== "PUBLISHED") {
        notFound();
    }

    const isFeatured = eventData.category === "FEATURED_EVENTS";

    const showRegisteredPlayers = isFeatured && (eventData as any).showRegisteredPlayers === true;
    const registeredPlayers = showRegisteredPlayers
        ? (
            await adminDb
                .collection("events")
                .doc(eventId)
                .collection("event_registrations")
                .where("isDraft", "==", false)
                .limit(200)
                .get()
        ).docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((d) => d.paymentStatus === "paid" || d.paymentStatus === "partial")
            .sort((a, b) => {
                const fa = String(a.firstName ?? "")
                    .trim()
                    .toLocaleLowerCase();
                const fb = String(b.firstName ?? "")
                    .trim()
                    .toLocaleLowerCase();
                return fa.localeCompare(fb, undefined, { sensitivity: "base" });
            })
            .map((data) => {
                const title = String(data.title ?? "").trim();
                const firstName = String(data.firstName ?? "").trim();
                const lastName = String(data.lastName ?? "").trim();
                const name = [title, firstName, lastName].filter(Boolean).join(" ").trim();
                const jamaat = String(data.jamaatAffiliation ?? "").trim();
                const age = ageFromDob(data.dateOfBirth);
                return { id: String(data.id), name, jamaat, age };
            })
        : [];

    const registerHref =
        eventData.registrationFormType === "volleyball"
            ? `/register/volleyball?eventId=${eventId}`
            : eventData.customSignupUrl
            ? eventData.customSignupUrl
            : `/api/checkout?type=register&eventId=${eventId}`;

    const showRegisterButton =
        isFeatured && eventData.showRegistrationFees !== false;

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* HERO SECTION */}
            <div className="relative w-full h-[40vh] md:h-[60vh] bg-muted">
                {eventData.imageUrl ? (
                    <Image
                        src={eventData.imageUrl}
                        alt={eventData.title}
                        fill
                        className="object-cover object-center"
                        sizes="100vw"
                        priority
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-white">
                        <ImageIcon size={64} className="opacity-20" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 container mx-auto">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-4">
                        {eventData.title}
                    </h1>
                    <p className="text-xl max-w-2xl line-clamp-2 gap-4 flex flex-col md:flex-row md:items-center">
                        <span className="inline-flex w-fit items-center rounded-full border border-primary/30 bg-background/85 px-4 py-1.5 text-base md:text-lg font-semibold text-foreground shadow-sm">
                            <Calendar className="w-5 h-5 mr-2 text-primary" />
                            {formatEventDateRange(eventData.startTime, eventData.endTime)}
                        </span>
                    </p>
                    {showRegisterButton && (
                        <div className="mt-8 hidden md:block">
                            <Button className="h-14 px-10 text-lg font-bold rounded-full shadow-lg" size="lg" asChild>
                                <Link href={registerHref}>Register Now</Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="container max-w-5xl mx-auto px-4 py-12 space-y-16">
                {isFeatured && (
                    <FeaturedEventNav
                        showHighlights={eventData.showPhotoGallery !== false && (eventData as any).photoUrls?.length > 0}
                        showFees={
                            eventData.showRegistrationFees !== false &&
                            !!eventData.registrationFees &&
                            eventData.registrationFees.length > 0
                        }
                        showDonate={(eventData as any).showDonation === true}
                        showPlayers={showRegisteredPlayers}
                    />
                )}
                
                {/* COUNTDOWN + EVENT INFO (above Highlights) */}
                <section id="details" className="scroll-mt-28">
                    <EventCountdown
                        countdownTo="registrationDeadline"
                        eventStart={toIsoStringOrNull((eventData as any).startTime)}
                        registrationStart={toIsoStringOrNull((eventData as any).registrationStart)}
                        registrationEnd={toIsoStringOrNull((eventData as any).registrationEnd)}
                        registrationDeadline={(eventData as any).registrationDeadline ?? null}
                        eventLocation={(eventData as any).eventLocation}
                        addressUrl={(eventData as any).addressUrl}
                        genderPolicy={(eventData as any).genderPolicy}
                        ageRestriction={(eventData as any).ageRestriction}
                        participationLocale={(eventData as any).participationLocale}
                        showLocation={(eventData as any).showLocation !== false}
                        showGender={(eventData as any).showGender !== false}
                        showAgeRestriction={isFeatured && (eventData as any).showAgeRestriction !== false}
                        showLocale={isFeatured && (eventData as any).showLocale !== false}
                    />
                </section>

                {/* HIGHLIGHTS — after details row, before description */}
                {isFeatured && eventData.showPhotoGallery !== false && (eventData as any).photoUrls?.length > 0 && (
                    <section id="highlights" className="scroll-mt-28">
                        <PhotoCarousel
                            photos={(eventData as any).photoUrls}
                            title={eventData.title}
                        />
                    </section>
                )}

                {/* DESCRIPTION */}
                {eventData.description && (
                    <div className="prose prose-neutral dark:prose-invert max-w-4xl text-foreground whitespace-pre-wrap leading-relaxed md:text-lg">
                        {eventData.description}
                    </div>
                )}

                {/* TOURNAMENT DETAILS — dynamic fields from Firestore */}
                {isFeatured && (() => {
                    const d = eventData as any;
                    const deadline = d.registrationDeadline;
                    const format = d.tournamentFormat;
                    const teamCap = d.teamCap;
                    const prizePool = d.prizePool;
                    const prizeNote = d.prizeNote;
                    const refundPolicy = d.refundPolicy;

                    const cards: React.ReactNode[] = [];

                    if (deadline && d.showRegistrationDeadline !== false) {
                        const formatted = new Date(deadline + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                        cards.push(
                            <div key="deadline" className="rounded-2xl border bg-card p-5">
                                <div className="flex items-center gap-2 text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                                    <Clock className="w-4 h-4" /> Registration Deadline
                                </div>
                                <p className="font-bold text-lg">{formatted}</p>
                            </div>
                        );
                    }
                    if (format && d.showTournamentFormat !== false) {
                        cards.push(
                            <div key="format" className="rounded-2xl border bg-card p-5">
                                <div className="flex items-center gap-2 text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                                    <Layers className="w-4 h-4" /> Format
                                </div>
                                <p className="font-bold text-lg">{format}</p>
                            </div>
                        );
                    }
                    if (teamCap && d.showTeamCap !== false) {
                        cards.push(
                            <div key="teamcap" className="rounded-2xl border bg-card p-5">
                                <div className="flex items-center gap-2 text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                                    <Users className="w-4 h-4" /> Team Cap
                                </div>
                                <p className="font-bold text-lg">{teamCap} Teams Max</p>
                                <p className="text-xs text-muted-foreground">Limited spots — register early</p>
                            </div>
                        );
                    }
                    if (prizePool && d.showPrizePool !== false) {
                        cards.push(
                            <div key="prize" className="rounded-2xl border bg-card p-5">
                                <div className="flex items-center gap-2 text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">
                                    <Trophy className="w-4 h-4 text-yellow-500" /> Prize Pool
                                </div>
                                <p className="font-bold text-2xl text-yellow-600 dark:text-yellow-400">${Number(prizePool).toLocaleString()}</p>
                                {prizeNote && <p className="text-xs text-muted-foreground">{prizeNote}</p>}
                            </div>
                        );
                    }

                    if (!cards.length && !refundPolicy) return null;

                    return (
                        <div className="space-y-6">
                            {cards.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{cards}</div>
                            )}
                            {refundPolicy && d.showRefundPolicy !== false && (
                                <div className="rounded-2xl border bg-muted/30 p-6 flex gap-4">
                                    <ShieldAlert className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-semibold text-sm">Refund Policy</p>
                                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{refundPolicy}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* HISTORY */}
                {isFeatured && eventData.showHistory && eventData.historyDetails && (
                    <section className="bg-muted/30 p-8 md:p-12 rounded-3xl">
                        <h2 className="text-3xl font-bold mb-6 flex items-center">
                            <History className="w-8 h-8 mr-3 text-primary" /> Event History
                        </h2>
                        <div className="text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {eventData.historyDetails}
                        </div>
                    </section>
                )}

                {/* FEES AND SPONSORSHIPS - STACKED FULL WIDTH */}
                <div className="space-y-8">
                    {/* REGISTRATION FEES */}
                    {isFeatured && eventData.showRegistrationFees !== false && eventData.registrationFees && eventData.registrationFees.length > 0 && (
                        <section id="fees" className="scroll-mt-28">
                            <Card className="rounded-3xl border-2 shadow-sm overflow-hidden">
                                <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-8 bg-card">
                                    <div>
                                        <h3 className="text-3xl font-bold mb-2">Registration</h3>
                                        <p className="text-muted-foreground">Secure your spot today before it fills up.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {eventData.registrationFees.map((fee, idx) => (
                                            <div key={idx} className="bg-muted px-6 py-4 rounded-2xl min-w-[200px]">
                                                <p className="font-semibold text-lg">{fee.type}</p>
                                                {fee.description && <p className="text-sm text-muted-foreground mb-2">{fee.description}</p>}
                                                <p className="font-extrabold text-2xl">${fee.amount}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </section>
                    )}

                    {/* DONATION SECTION */}
                    {isFeatured && (eventData as any).showDonation === true && (
                        <section id="donate" className="scroll-mt-28">
                            <DonationSection eventId={eventId} />
                        </section>
                    )}

                    {/* REGISTERED PLAYERS */}
                    {showRegisteredPlayers && (
                        <section id="players" className="scroll-mt-28">
                            <Card className="rounded-3xl border-2 shadow-sm overflow-hidden">
                                <div className="p-8 md:p-10 bg-card space-y-6">
                                    <div className="space-y-1">
                                        <h3 className="text-3xl font-bold">Registered Players</h3>
                                        <p className="text-muted-foreground">
                                            {registeredPlayers.length} player{registeredPlayers.length !== 1 ? "s" : ""} registered so far.
                                        </p>
                                    </div>

                                    {registeredPlayers.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">No registrations yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="text-muted-foreground">
                                                    <tr className="border-b">
                                                        <th className="text-left font-semibold py-2 pr-4">Name</th>
                                                        <th className="text-left font-semibold py-2 pr-4">Jamaat</th>
                                                        <th className="text-left font-semibold py-2 pr-4">Age</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {registeredPlayers.map((p) => (
                                                        <tr key={p.id} className="border-b last:border-b-0">
                                                            <td className="py-2 pr-4 font-medium">{p.name || "—"}</td>
                                                            <td className="py-2 pr-4">{p.jamaat || "—"}</td>
                                                            <td className="py-2 pr-4 tabular-nums">{p.age ?? "—"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </section>
                    )}
                </div>
            </div>

            {/* Sticky Register Now bar */}
            {showRegisterButton && (
                <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                    <div className="container max-w-5xl mx-auto flex items-center justify-between gap-4">
                        <div className="hidden sm:block">
                            <p className="font-semibold text-sm">{eventData.title}</p>
                            {eventData.registrationFees && eventData.registrationFees.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    From ${eventData.registrationFees[0].amount} · {eventData.registrationFees[0].type}
                                </p>
                            )}
                        </div>
                        <Button
                            className="w-full sm:w-auto h-12 px-8 text-base font-bold rounded-full shadow-md"
                            size="lg"
                            asChild
                        >
                            <Link href={registerHref}>Register Now →</Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
