import { Timestamp } from "firebase/firestore";

export type Role = "MEMBER" | "ADMIN" | "SUPER_ADMIN";
export type EventCategory = "WEEKLY_SPORTS" | "MONTHLY_EVENTS" | "FEATURED_EVENTS";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
export type GenderPolicy = "ALL" | "MALE_ONLY" | "FEMALE_ONLY";
export type RsvpStatus = "CONFIRMED" | "WAITLISTED" | "CANCELLED";
export type TransactionType = "CREDIT" | "DEBIT";
export type PurchaseStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export interface UserProfile {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    photoURL?: string | null;
    phone?: string | null;
    role: Role;
    tokenBalance: number;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    // New Fields
    age?: number;
    height?: string; // e.g. "5'9"
    weight?: string; // e.g. "160 lbs"
    iceContact?: {
        name: string;
        phone: string;
        relation: string;
    };
    skillLevels?: Record<string, string>; // Sport ID -> Level (e.g. "badminton": "intermediate")
}
export interface RegistrationFee {
    type: string; // e.g. "Early Bird", "Normal", "Late"
    amount: number;
    description?: string;
}

export interface SponsorshipTier {
    name: string; // e.g. "Gold", "Silver"
    cost: number;
    features: string[];
}

export interface PaymentMethod {
    id: string;
    type: "card";
    last4: string;
    brand: string; // visa, mastercard
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}

export interface Wallet {
    balance: number; // Token balance
    paymentMethods: PaymentMethod[];
    transactions: TokenTransaction[]; // could be reference or subcollection in real app
}

export interface SportEvent {
    id: string;
    title: string;
    description?: string | null;
    category: EventCategory;
    sportId: string; // e.g., "badminton", "volleyball"
    locationId?: string | null;
    startTime: Timestamp;
    endTime: Timestamp;
    capacity: number;
    tokensRequired: number;
    genderPolicy: GenderPolicy;
    status: EventStatus;
    isPublic: boolean;
    createdAt: Timestamp;
    createdBy?: string | null;
    // New Fields
    imageUrl?: string | null;
    addressUrl?: string | null; // Google Maps Link
    guestFee?: number | null;
    recurrenceRule?: string | null; // e.g. "WEEKLY", "DAILY"
    registrationStart?: Timestamp | null;
    registrationEnd?: Timestamp | null;
    customSignupUrl?: string | null; // External link for registration (e.g. JotForm)
    registrationFormType?: string | null; // e.g. "standard", "volleyball"
    useVideoBanner?: boolean;
    videoTemplate?: string; // Identifier for the remotion template to use

    // Featured Event Specific Fields
    slug?: string | null;
    eventLocation?: string | null;
    ageRestriction?: string | null; // e.g. "youth", "adult", "all"
    participationLocale?: string | null; // e.g. "local", "national", "international"
    
    registrationFees?: RegistrationFee[] | null;
    sponsorshipTiers?: SponsorshipTier[] | null;
    
    historyDetails?: string | null;

    // Tournament detail fields
    registrationDeadline?: string | null;   // ISO date string e.g. "2026-04-19"
    refundPolicy?: string | null;
    tournamentFormat?: string | null;       // e.g. "6v6 3-Touch · Double Elimination"
    teamCap?: number | null;
    prizePool?: number | null;
    prizeNote?: string | null;              // e.g. "to winning team's owner"

    // Photo gallery — uploaded images stored in Firebase Storage
    photoUrls?: string[] | null;
    photoGalleryUrl?: string | null;        // legacy external URL (kept for back-compat)

    // Configurable Toggles for Landing Page
    showLocation?: boolean;
    showGender?: boolean;
    showAgeRestriction?: boolean;
    showLocale?: boolean;
    showRegistrationFees?: boolean;
    showSponsorshipTiers?: boolean;
    showPhotoGallery?: boolean;
    showHistory?: boolean;
    showRegistrationDeadline?: boolean;
    showRefundPolicy?: boolean;
    showTournamentFormat?: boolean;
    showTeamCap?: boolean;
    showPrizePool?: boolean;
    showDonation?: boolean;
    showRegisteredPlayers?: boolean;
}

export interface EventRSVP {
    id: string; // `${eventId}_${userId}`
    eventId: string;
    userId: string;
    status: RsvpStatus;
    waitlistPosition?: number | null;
    attended?: boolean | null;
    createdAt: Timestamp;
}

export interface TokenTransaction {
    id: string;
    userId: string;
    type: TransactionType;
    amount: number;
    description?: string | null;
    eventId?: string | null; // If related to an RSVP
    createdAt: Timestamp;
}

export interface NewsArticle {
    id: string;
    title: string;
    excerpt: string;
    content: string; // Markdown or HTML
    authorId: string;
    coverImage?: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    publishedAt: Timestamp | string;
    createdAt: Timestamp | string;
    updatedAt: Timestamp | string;
}
