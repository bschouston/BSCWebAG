import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type ClientItem = {
    id: string;
    type: "registration" | "product" | "token";
    title: string;
    amount: number; // unit price
    quantity?: number; // defaults to 1
    metadata?: {
        eventId?: string;
        registrationId?: string;
        sponsorTier?: string;
        [key: string]: unknown;
    };
};

export async function POST(request: Request) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });
    const adminDb = getAdminDb();
    try {
        const { items, cancelUrl: rawCancelUrl, customerEmail } = (await request.json()) as {
            items: ClientItem[];
            cancelUrl?: string;
            customerEmail?: string;
        };

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        // Fetch event data for all unique eventIds so we can verify prices server-side
        const eventIds = [
            ...new Set(
                items
                    .map((item) => item.metadata?.eventId)
                    .filter((id): id is string => Boolean(id))
            ),
        ];

        const eventMap: Record<string, Record<string, any>> = {};
        await Promise.all(
            eventIds.map(async (eventId) => {
                const snap = await adminDb.collection("events").doc(eventId).get();
                if (snap.exists) eventMap[eventId] = snap.data() as Record<string, any>;
            })
        );

        // Resolve authoritative server-side price for each item
        const resolvedAmounts = items.map((item) => {
            let serverAmount: number | null = null;

            const eventId = item.metadata?.eventId;
            if (eventId && eventMap[eventId]) {
                const event = eventMap[eventId];

                if (item.type === "registration") {
                    const fee = event.registrationFees?.[0]?.amount;
                    if (fee != null) serverAmount = Number(fee);
                } else if (item.type === "product" && item.metadata?.sponsorTier) {
                    const tier = (event.sponsorshipTiers ?? []).find(
                        (t: any) => t.name === item.metadata?.sponsorTier
                    );
                    if (tier?.cost != null) serverAmount = Number(tier.cost);
                }
            }

            // Donations: allow custom amount, but validate bounds server-side
            if (
                serverAmount === null &&
                item.type === "product" &&
                item.metadata?.donation === true
            ) {
                const amt = Number(item.amount);
                if (!Number.isFinite(amt) || amt <= 0) {
                    throw new Error("Donation amount must be greater than $0.");
                }
                if (amt > 10000) {
                    throw new Error("Donation amount is too large.");
                }
                serverAmount = amt;
            }

            if (serverAmount === null) {
                throw new Error(
                    `Could not verify the price for "${item.title}". Please refresh and try again.`
                );
            }

            return { item, serverAmount };
        });

        // Resolve the public site origin for Stripe return URLs.
        // request.url can resolve to localhost behind reverse proxies, so prefer
        // the env var, then forwarded headers, then a canonical fallback.
        const isLocal = (u: string | null | undefined) =>
            !u || /localhost|127\.0\.0\.1/i.test(u);
        const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
        const fwdHost =
            request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
        const headerOrigin = fwdHost ? `${fwdProto}://${fwdHost}` : null;
        const requestIsLocal = isLocal(headerOrigin);
        const origin =
            envUrl && (!isLocal(envUrl) || requestIsLocal)
                ? envUrl
                : !requestIsLocal
                  ? headerOrigin!
                  : envUrl ?? "https://burhanisportsclub.com";

        // Allow callers (e.g. registration form) to provide their own cancel URL
        // so Stripe returns the user to the right page instead of the generic /cart.
        const cancelUrl = rawCancelUrl ?? `${origin}/cart`;

        // Embed registration IDs in metadata so the webhook / verify endpoint can update Firestore
        const registrationMeta = items
            .filter(
                (item) =>
                    item.type === "registration" &&
                    item.metadata?.eventId &&
                    item.metadata?.registrationId
            )
            .map((item) => ({
                eventId: item.metadata!.eventId,
                registrationId: item.metadata!.registrationId,
            }));

        const registrationsJson = JSON.stringify(registrationMeta);

        // ── One-time payment mode (installments removed) ────────────────────────
        const line_items = resolvedAmounts.map(({ item, serverAmount }) => ({
            price_data: {
                currency: "usd",
                product_data: { name: item.title },
                unit_amount: Math.round(serverAmount * 100),
            },
            quantity: item.quantity ?? 1,
        }));

        // Populate Stripe's "Description" field (PaymentIntent.description) so
        // the Dashboard shows a meaningful label per registration.
        const sessionDescription = line_items.length === 1 ? resolvedAmounts[0].item.title : resolvedAmounts
            .slice(0, 3)
            .map(({ item }) => item.title)
            .join(", ");

        const session = await stripe.checkout.sessions.create({
            line_items,
            mode: "payment",
            ...(customerEmail ? { customer_email: customerEmail } : {}),
            payment_intent_data: {
                description: sessionDescription,
            },
            metadata: {
                registrations: registrationsJson,
                paymentType: "full",
            },
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Checkout failed";
        console.error("Stripe checkout error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
