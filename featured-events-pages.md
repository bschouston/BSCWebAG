# Featured Events Implementation Plan

## Goal Description
Enhance the "Featured Events" functionality in the app. Currently, all events share a standard data structure and UI. The goal is to allow Featured Events to have their own dedicated Premium Landing Page (`/events/[slug]`) and be accessible directly from the top navigation bar. The admin dashboard needs to be updated to input these detailed fields and toggle their visibility on the landing page. We will also integrate placeholders for Stripe payment gateways for registration fees and sponsorship tiers.

## Proposed Changes

### Database & Types Layer
#### [MODIFY] src/types/index.ts
- Expand `SportEvent` interface with comprehensive fields for Featured Events: `slug`, `eventLocation` (distinct from internal ID), `ageRestriction` ("youth", "adult", "all"), `participationLocale` ("local", "national", "international"), `photoGalleryUrl` (external link), `historyDetails`.
- Add new array interfaces: `RegistrationFee[]` and `SponsorshipTier[]`.
- Add toggle booleans: `showLocation`, `showGender`, `showAgeRestriction`, `showLocale`, `showRegistrationFees`, `showSponsorshipTiers`, `showPhotoGallery`, `showHistory`.

### Admin Dashboard Layer
#### [MODIFY] src/components/admin/event-form.tsx
- Conditionally render a "Featured Event Details" section when `category === 'FEATURED_EVENTS'`.
- Add inputs for the new detailed fields.
- Add dynamic input arrays for Registration Fees and Sponsorship Tiers.
- Add toggle switches for each section to determine if they show on the landing page.
- Note: Requires updating the form`s Zod schema (`eventSchema`).

#### [MODIFY] src/app/api/events/route.ts & src/app/api/events/[id]/route.ts
- Automatically generate a URL-friendly `slug` from the `title` if it doesn't exist, to support `/events/[slug]`.

### Marketing / Frontend Layouts
#### [MODIFY] src/components/layout/navbar.tsx
- Add a fetching hook (or Firebase query) to retrieve up to 2 active `FeaturedEvents` (`status === 'PUBLISHED'`).
- Dynamically inject these events as direct links into the top navigation bar using `/events/[slug]`.

#### [MODIFY] src/components/layout/mobile-nav.tsx
- Ensure the dynamically fetched featured events also populate the mobile hamburger menu.

### Dynamic Routing Layer
#### [NEW] src/app/(marketing)/events/[slug]/page.tsx
- Create a new Dynamic Route for event landing pages.
- Fetch the event by its `slug` from Firebase.
- Build a premium UI layout conditionally rendering:
  - Hero image (using `imageUrl`)
  - Info Grid (Location, Date, Locale, Age Restriction, Gender constraints)
  - Detail Sections: History, Photo Gallery Link
  - Interactive Pricing Tables: Registration Fees and Sponsorship Tiers with "Pay/Register" placeholder buttons mapped to Stripe logic.

### API & Payments Layer (Stripe)
#### [NEW] src/app/api/checkout/route.ts
- Create a basic API route for Stripe Checkout Session creation. This will handle incoming requests for Sponsorship / Event Registration.

## Verification Plan
### Automated Tests
- Run `python .agent/scripts/checklist.py .` to ensure no linting or typescript compilation errors were introduced.
- Run `npm run build` locally to verify Next.js passes build.

### Manual Verification
- In the admin dashboard, create a new event with category "Featured Event". Fill out the complex arrays (Fees, Sponsors) and toggles. Save.
- Check the top Navigation Bar as an unauthenticated/regular user to ensure the newly published Featured Event appears as a direct link.
- Click the featured event link and verify that the premium landing page at `/events/[slug]` displays correctly.
