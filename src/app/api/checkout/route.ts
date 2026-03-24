import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const eventId = searchParams.get("eventId");

    if (!type || !eventId) {
        return NextResponse.json({ error: "Missing type or eventId" }, { status: 400 });
    }

    // TODO: Integrate Stripe Checkout
    // 1. Fetch event from Firestore using adminDb
    // 2. Identify the cost from event.registrationFees or event.sponsorshipTiers
    // 3. Create a Stripe Checkout Session 
    // 4. Return NextResponse.redirect(stripeSession.url)

    // Placeholder: Redirect back to the event page with a query param
    const redirectUrl = new URL(`/events/${eventId}?checkout=${type}_placeholder_active`, request.url);
    return NextResponse.redirect(redirectUrl);
}
