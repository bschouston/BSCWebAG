import { Timestamp } from "firebase/firestore";

export type Role = "MEMBER" | "ADMIN" | "SUPER_ADMIN" | "TRACKER";
export type EventCategory = "WEEKLY_SPORTS" | "FEATURED_EVENTS";
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
    /** Club ITS membership number (exactly 8 digits). Immutable after claim. */
    itsNumber?: string | null;
    role: Role;
    tokenBalance: number;
    isActive: boolean;
    /** Wallet frozen after Stripe dispute — Super Admin unfreezes; no auto clawback */
    billingFrozen?: boolean;
    billingFrozenAt?: Timestamp | null;
    billingFrozenReason?: string | null;
    billingFreezeDisputeId?: string | null;
    billingFreezeMeta?: Record<string, unknown> | null;
    /** Stripe wallet (Admin SDK / server only) */
    stripeCustomerId?: string | null;
    stripeCustomerIdTest?: string | null;
    /** Super Admin: token wallet uses Stripe test keys when "test" */
    walletStripeMode?: "live" | "test" | null;
    defaultPaymentMethodId?: string | null;
    defaultPaymentMethodIdTest?: string | null;
    cardBrand?: string | null;
    cardBrandTest?: string | null;
    cardLast4?: string | null;
    cardLast4Test?: string | null;
    cardExpMonth?: number | null;
    cardExpMonthTest?: number | null;
    cardExpYear?: number | null;
    cardExpYearTest?: number | null;
    /** Active token package for auto replenish at RSVP */
    tokenAutoReplenishPackageId?: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    /** Nested player profile (phase 1). Prefer this over legacy flat fields. */
    playerProfile?: {
        version: 1;
        phone?: string | null;
        address?: {
            line1: string;
            line2?: string | null;
            city: string;
            state: string;
            postalCode: string;
            country: string;
        } | null;
        dateOfBirth?: string | null;
        gender?: "male" | "female" | null;
        heightInches?: number | null;
        weightLbs?: number | null;
        photoPath?: string | null;
        sports?: Record<
            string,
            {
                preferred: boolean;
                skillLevel?: "beginner" | "intermediate" | "advanced" | "competitive" | null;
            }
        >;
        iceContact?: {
            name: string;
            phone: string;
            relation: string;
        } | null;
        updatedAt?: string;
    } | null;
    // Legacy flat fields (still read for migration)
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
    /** @deprecated Prefer tokensMin/tokensMax for weekly events; kept for back-compat */
    tokensRequired: number;
    tokensMin?: number | null;
    tokensMax?: number | null;
    minCapacity?: number | null;
    seriesId?: string | null;
    occurrenceKey?: string | null;
    rsvpOpensAt?: Timestamp | null;
    rsvpClosesAt?: Timestamp | null;
    /** Admin force-open / force-close; null follows the scheduled RSVP window. */
    rsvpManualOverride?: "open" | "closed" | null;
    timezone?: string | null;
    confirmedCount?: number | null;
    waitlistCount?: number | null;
    settlePreviewTokens?: number | null;
    tokensFinal?: number | null;
    tokensSettledAt?: Timestamp | null;
    /** Set when admin saves This week's attendance; required before finalize if anyone is confirmed. */
    attendanceSavedAt?: Timestamp | null;
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
    registrationsClosedAt?: Timestamp | null;
    customSignupUrl?: string | null; // External link for registration (e.g. JotForm)
    registrationFormType?: string | null; // e.g. "standard", "volleyball", "dynamic"
    /** Firestore registrationForms/{id} — reusable template linked to this event */
    registrationFormId?: string | null;
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
    noShow?: boolean | null;
    /** Tokens already credited back on a no-show save (idempotent). */
    noShowRefunded?: number | null;
    /** Tokens escrowed at RSVP (weekly); settled later */
    tokensHeld?: number | null;
    tokensFinal?: number | null;
    tokensMin?: number | null;
    tokensMax?: number | null;
    /** New tokensMax the member must authorize after an admin increase */
    pendingTokenIncreaseTo?: number | null;
    /** One-time extra-hold reminder sent from attendance (admin). */
    attendanceAuthReminderSentAt?: Timestamp | null;
    createdAt: Timestamp;
}

export interface TokenTransaction {
    id: string;
    userId: string;
    type: TransactionType;
    amount: number;
    reason?:
        | "purchase"
        | "auto_replenish"
        | "unit_purchase"
        | "package_purchase"
        | "rsvp_hold"
        | "rsvp_settle_refund"
        | "rsvp_cancel_refund"
        | "transfer_in"
        | "transfer_out"
        | "admin_adjust"
        | "rsvp"
        | null;
    description?: string | null;
    idempotencyKey?: string | null;
    eventId?: string | null;
    rsvpId?: string | null;
    counterpartyUid?: string | null;
    stripePaymentIntentId?: string | null;
    stripeLivemode?: boolean | null;
    stripeAmountPaid?: number | null;
    stripeChargeStatus?: string | null;
    stripeRefundId?: string | null;
    refundedAt?: Timestamp | string | null;
    transferId?: string | null;
    adminUid?: string | null;
    balanceBefore?: number | null;
    balanceAfter?: number | null;
    meta?: Record<string, unknown> | null;
    createdAt: Timestamp;
}

export interface TokenPackage {
    id: string;
    tokenAmount: number;
    priceCents: number;
    currency: string;
    active: boolean;
    sortOrder: number;
    label?: string | null;
    /** Hex used on member wallet buy-token cards */
    cardColor?: string | null;
    createdAt?: Timestamp | string | null;
    updatedAt?: Timestamp | string | null;
}

export interface TokenPricingConfigDoc {
    unitPriceCents: number;
    currency: string;
    updatedAt?: Timestamp | string | null;
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
