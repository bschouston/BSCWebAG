import { adminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import { SportEvent, RegistrationFee, SponsorshipTier } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Calendar, Clock, Users, Globe, History, Image as ImageIcon, Star } from "lucide-react";
import Link from "next/link";
import { Timestamp } from "firebase-admin/firestore";

function formatDate(timestamp: any) {
    if (!timestamp) return "TBD";
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return "TBD";
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).format(date);
}

export default async function EventLandingPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    let eventData: SportEvent | null = null;
    let eventId = slug;

    try {
        // Query by slug first
        const slugQuery = await adminDb.collection("events").where("slug", "==", slug).limit(1).get();
        if (!slugQuery.empty) {
            const doc = slugQuery.docs[0];
            eventData = { id: doc.id, ...doc.data() } as unknown as SportEvent;
            eventId = doc.id;
        } else {
            // Fallback: try by ID
            const doc = await adminDb.collection("events").doc(slug).get();
            if (doc.exists) {
                eventData = { id: doc.id, ...doc.data() } as unknown as SportEvent;
            }
        }
    } catch (e) {
        console.error("Error fetching event", e);
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
                    {isFeatured && (
                        <span className="inline-flex items-center rounded-full bg-primary/20 px-3 py-1 text-sm font-medium text-primary mb-4 ring-1 ring-inset ring-primary/30">
                            <Star className="w-4 h-4 mr-1" /> Featured Event
                        </span>
                    )}
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-4">
                        {eventData.title}
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl line-clamp-2 gap-4 flex flex-col md:flex-row md:items-center">
                        <span className="flex items-center"><Calendar className="w-5 h-5 mr-2"/> {formatDate(eventData.startTime)}</span>
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    
                    {/* LEFT COLUMN - MAIN CONTENT */}
                    <div className="lg:col-span-2 space-y-12">
                        {/* DESCRIPTION */}
                        {eventData.description && (
                            <section>
                                <h2 className="text-2xl font-semibold mb-4 border-b pb-2">About This Event</h2>
                                <div className="prose prose-neutral dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                                    {eventData.description}
                                </div>
                            </section>
                        )}

                        {/* HISTORY */}
                        {isFeatured && eventData.showHistory && eventData.historyDetails && (
                            <section>
                                <h2 className="text-2xl font-semibold mb-4 border-b pb-2 flex items-center">
                                    <History className="w-6 h-6 mr-2 text-primary" /> Event History
                                </h2>
                                <div className="p-6 bg-muted/50 rounded-xl leading-relaxed whitespace-pre-wrap">
                                    {eventData.historyDetails}
                                </div>
                            </section>
                        )}

                        {/* PHOTO GALLERY */}
                        {isFeatured && eventData.showPhotoGallery && eventData.photoGalleryUrl && (
                            <section>
                                <div className="p-8 border rounded-xl bg-card text-center flex flex-col items-center justify-center space-y-4">
                                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                                    <h3 className="text-xl font-medium">Relive the Moments</h3>
                                    <p className="text-sm text-muted-foreground">Check out the official photo gallery for past highlights.</p>
                                    <Button asChild variant="secondary">
                                        <a href={eventData.photoGalleryUrl} target="_blank" rel="noopener noreferrer">
                                            View Photo Gallery
                                        </a>
                                    </Button>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* RIGHT COLUMN - DETAILS & REGISTRATION */}
                    <div className="space-y-8">
                        {/* QUICK INFO CARD */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Event Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {eventData.showLocation !== false && (eventData.eventLocation || eventData.addressUrl) && (
                                    <div className="flex items-start">
                                        <MapPin className="w-5 h-5 mr-3 text-muted-foreground mt-0.5" />
                                        <div>
                                            <p className="font-medium">Location</p>
                                            <p className="text-sm text-muted-foreground">{eventData.eventLocation || "Venue"}</p>
                                            {eventData.addressUrl && (
                                                <a href={eventData.addressUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Get Directions</a>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {eventData.showGender !== false && eventData.genderPolicy && (
                                    <div className="flex items-center">
                                        <Users className="w-5 h-5 mr-3 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Gender Policy</p>
                                            <p className="text-sm text-muted-foreground">
                                                {eventData.genderPolicy === "ALL" ? "All Genders" : eventData.genderPolicy === "MALE_ONLY" ? "Male Only" : "Female Only"}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {isFeatured && eventData.showAgeRestriction !== false && eventData.ageRestriction && (
                                    <div className="flex items-center">
                                        <Clock className="w-5 h-5 mr-3 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Age Restriction</p>
                                            <p className="text-sm text-muted-foreground">{eventData.ageRestriction}</p>
                                        </div>
                                    </div>
                                )}

                                {isFeatured && eventData.showLocale !== false && eventData.participationLocale && (
                                    <div className="flex items-center">
                                        <Globe className="w-5 h-5 mr-3 text-muted-foreground" />
                                        <div>
                                            <p className="font-medium">Participation</p>
                                            <p className="text-sm text-muted-foreground capitalize">{eventData.participationLocale}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* REGISTRATION FEES */}
                        {isFeatured && eventData.showRegistrationFees !== false && eventData.registrationFees && eventData.registrationFees.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Registration</CardTitle>
                                    <CardDescription>Secure your spot today</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {eventData.registrationFees.map((fee, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                            <div>
                                                <p className="font-medium">{fee.type}</p>
                                                {fee.description && <p className="text-xs text-muted-foreground">{fee.description}</p>}
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-lg">${fee.amount}</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full" asChild>
                                        <Link href={`/api/checkout?type=register&eventId=${eventId}`}>
                                            Register Now
                                        </Link>
                                    </Button>
                                </CardFooter>
                            </Card>
                        )}

                        {/* SPONSORSHIPS */}
                        {isFeatured && eventData.showSponsorshipTiers !== false && eventData.sponsorshipTiers && eventData.sponsorshipTiers.length > 0 && (
                            <Card className="border-primary/20 bg-primary/5">
                                <CardHeader>
                                    <CardTitle>Become a Sponsor</CardTitle>
                                    <CardDescription>Support this event and get brand exposure</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {eventData.sponsorshipTiers.map((tier, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex justify-between items-end border-b pb-2">
                                                <span className="font-semibold text-primary">{tier.name}</span>
                                                <span className="font-bold">${tier.cost}</span>
                                            </div>
                                            {tier.features && tier.features.length > 0 && typeof tier.features === 'object' && (
                                                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                                                    {(tier.features as string[]).map((feature, fidx) => (
                                                        <li key={fidx}>{feature}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {tier.features && typeof tier.features === 'string' && (
                                                <p className="text-sm text-muted-foreground">{(tier.features as string).split(',').join(' • ')}</p>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                                <CardFooter>
                                    <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/10" asChild>
                                        <Link href={`/api/checkout?type=sponsor&eventId=${eventId}`}>
                                            Sponsor Event
                                        </Link>
                                    </Button>
                                </CardFooter>
                            </Card>
                        )}
                        
                    </div>
                </div>
            </div>
        </div>
    );
}
