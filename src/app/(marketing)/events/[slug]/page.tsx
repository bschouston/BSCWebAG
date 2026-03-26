import { adminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Calendar, Clock, Users, Globe, History, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { SponsorshipSection } from "@/components/events/sponsorship-section";
import type { Metadata } from "next";

const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";

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
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).format(startDate);

    if (!endTimestamp) return startStr;

     
    const endDate = typeof endTimestamp.toDate === 'function' ? endTimestamp.toDate() : new Date(endTimestamp as any);
    if (isNaN(endDate.getTime())) return startStr;

    const isSameDay = startDate.toDateString() === endDate.toDateString();
    if (isSameDay) {
        const endTimeStr = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
        }).format(endDate);
        return `${startStr} - ${endTimeStr}`;
    } else {
        const endStr = new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
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

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* HERO SECTION */}
            <div className="relative w-full h-[40vh] md:h-[60vh] bg-muted">
                {eventData.imageUrl ? (
                    <Image
                        src={eventData.imageUrl}
                        alt={eventData.title}
                        fill
                        className="object-cover"
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
                    <p className="text-xl text-muted-foreground max-w-2xl line-clamp-2 gap-4 flex flex-col md:flex-row md:items-center">
                        <span className="flex items-center"><Calendar className="w-5 h-5 mr-2"/> {formatEventDateRange(eventData.startTime, eventData.endTime)}</span>
                    </p>
                    {isFeatured && eventData.showRegistrationFees !== false && (
                        <div className="mt-8">
                            <Button className="w-full md:w-auto h-14 px-10 text-lg font-bold rounded-full shadow-lg" size="lg" asChild>
                                <Link 
                                    href={
                                        eventData.registrationFormType === "volleyball" 
                                            ? `/register/volleyball?eventId=${eventId}`
                                            : eventData.customSignupUrl 
                                                ? eventData.customSignupUrl 
                                                : `/api/checkout?type=register&eventId=${eventId}`
                                    }
                                >
                                    Register Now
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="container max-w-5xl mx-auto px-4 py-12 space-y-16">
                
                {/* HORIZONTAL METADATA BAR (Formerly in sidebar) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-8 border-y">
                    {eventData.showLocation !== false && (eventData.eventLocation || eventData.addressUrl) ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground"><MapPin className="w-4 h-4 mr-2" /> <span className="text-xs uppercase font-semibold tracking-wider">Location</span></div>
                            <p className="font-medium">{eventData.eventLocation || "Venue"}</p>
                            {eventData.addressUrl && (
                                <a href={eventData.addressUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline font-medium">Get Directions</a>
                            )}
                        </div>
                    ) : <div />}
                    
                    {eventData.showGender !== false && eventData.genderPolicy ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground"><Users className="w-4 h-4 mr-2" /> <span className="text-xs uppercase font-semibold tracking-wider">Gender Policy</span></div>
                            <p className="font-medium capitalize">{eventData.genderPolicy.replace('_', ' ').toLowerCase()}</p>
                        </div>
                    ) : <div />}

                    {isFeatured && eventData.showAgeRestriction !== false && eventData.ageRestriction ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground"><Clock className="w-4 h-4 mr-2" /> <span className="text-xs uppercase font-semibold tracking-wider">Age Range</span></div>
                            <p className="font-medium">{eventData.ageRestriction}</p>
                        </div>
                    ) : <div />}

                    {isFeatured && eventData.showLocale !== false && eventData.participationLocale ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center text-muted-foreground"><Globe className="w-4 h-4 mr-2" /> <span className="text-xs uppercase font-semibold tracking-wider">Locale</span></div>
                            <p className="font-medium capitalize">{eventData.participationLocale}</p>
                        </div>
                    ) : <div />}
                </div>

                {/* DESCRIPTION */}
                {eventData.description && (
                    <div className="prose prose-neutral dark:prose-invert max-w-4xl text-foreground whitespace-pre-wrap leading-relaxed md:text-lg">
                        {eventData.description}
                    </div>
                )}

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
                    )}

                    {/* SPONSORSHIPS */}
                    {isFeatured && eventData.showSponsorshipTiers !== false && eventData.sponsorshipTiers && eventData.sponsorshipTiers.length > 0 && (
                        <Card className="rounded-3xl border-2 border-primary/20 shadow-sm overflow-hidden bg-primary/5">
                            <div className="p-8 md:p-10 space-y-8">
                                <div className="text-center">
                                    <h3 className="text-3xl font-bold mb-2">Become a Sponsor</h3>
                                    <p className="text-muted-foreground">Support this event and get brand exposure</p>
                                </div>
                                <SponsorshipSection
                                    tiers={eventData.sponsorshipTiers}
                                    eventId={eventId}
                                    eventTitle={eventData.title}
                                />
                            </div>
                        </Card>
                    )}
                </div>

                {/* PHOTO GALLERY */}
                {isFeatured && eventData.showPhotoGallery && eventData.photoGalleryUrl && (
                    <section className="flex flex-col items-center justify-center p-12 bg-primary/5 rounded-3xl border border-primary/10 text-center">
                        <ImageIcon className="w-16 h-16 text-primary mb-6" />
                        <h3 className="text-4xl font-extrabold mb-4">Relive the Moments</h3>
                        <p className="text-lg text-muted-foreground max-w-xl mb-8">Check out the official photo gallery for past highlights and unforgettable memories.</p>
                        <Button asChild size="lg" className="rounded-full h-14 px-8 text-lg font-bold">
                            <a href={eventData.photoGalleryUrl} target="_blank" rel="noopener noreferrer">
                                View Full Photo Gallery
                            </a>
                        </Button>
                    </section>
                )}
            </div>
        </div>
    );
}
