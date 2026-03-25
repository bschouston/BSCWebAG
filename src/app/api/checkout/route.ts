import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover" as any,
});

export async function POST(request: Request) {
    try {
        const { items } = await request.json();

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        const line_items = items.map((item: { title: string; amount: number }) => ({
            price_data: {
                currency: "usd",
                product_data: {
                    name: item.title,
                },
                unit_amount: Math.round(item.amount * 100),
            },
            quantity: 1,
        }));

        const origin = new URL(request.url).origin;

        // Embed registration IDs so we can update Firestore after payment succeeds
        const registrationMeta = items
            .filter((item: any) => item.type === "registration" && item.metadata?.eventId && item.metadata?.registrationId)
            .map((item: any) => ({
                eventId: item.metadata.eventId,
                registrationId: item.metadata.registrationId,
            }));

        const session = await stripe.checkout.sessions.create({
            line_items,
            mode: "payment",
            metadata: {
                registrations: JSON.stringify(registrationMeta),
            },
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/cart`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Checkout failed";
        console.error("Stripe checkout error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
