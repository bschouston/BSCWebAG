import { redirect } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import Stripe from "stripe";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
    searchParams: Promise<{ eventId?: string; registrationId?: string }>;
}

export default async function ResumeCheckoutPage({ searchParams }: PageProps) {
    const { eventId, registrationId } = await searchParams;

    // ── Validate params ────────────────────────────────────────────────────
    if (!eventId || !registrationId) {
        return <ErrorScreen message="Invalid payment link. Please contact support." />;
    }

    // ── Fetch registration from Firestore ──────────────────────────────────
    let regData: Record<string, any> | null = null;
    let eventData: Record<string, any> | null = null;

    try {
        const [regSnap, eventSnap] = await Promise.all([
            adminDb
                .collection("events")
                .doc(eventId)
                .collection("event_registrations")
                .doc(registrationId)
                .get(),
            adminDb.collection("events").doc(eventId).get(),
        ]);

        if (!regSnap.exists) {
            return <ErrorScreen message="Registration not found. It may have been removed or the link is incorrect." />;
        }

        regData = regSnap.data() as Record<string, any>;
        eventData = eventSnap.exists ? (eventSnap.data() as Record<string, any>) : null;
    } catch {
        return <ErrorScreen message="Unable to load your registration. Please try again later." />;
    }

    const eventTitle = eventData?.title ?? "the event";
    const name = `${regData.firstName ?? ""} ${regData.lastName ?? ""}`.trim();

    // ── Already paid via Stripe (hard guard — cannot be bypassed by admin toggling status) ──
    // receiptStripeSession is stamped by /api/checkout/verify the moment Stripe confirms payment.
    // We check this first so a manually "Mark Pending" by admin never re-opens payment.
    if (regData.receiptStripeSession) {
        return (
            <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
                <div className="bg-green-100 dark:bg-green-900/30 w-24 h-24 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-center">Payment Already Processed</h1>
                <p className="text-muted-foreground mb-2 text-center max-w-md">
                    {name && <span className="font-medium text-foreground">{name}, </span>}
                    a payment has already been received for your registration for{" "}
                    <strong>{eventTitle}</strong>.
                </p>
                <p className="text-muted-foreground mb-8 text-center text-sm">
                    If you believe this is an error, please contact us directly.
                </p>
                <Link href="/">
                    <Button size="lg">Go Home</Button>
                </Link>
            </div>
        );
    }

    // ── Manually marked as paid by admin (no Stripe session) ──────────────
    if (regData.paymentStatus === "paid") {
        return (
            <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
                <div className="bg-green-100 dark:bg-green-900/30 w-24 h-24 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-center">Already Paid!</h1>
                <p className="text-muted-foreground mb-2 text-center max-w-md">
                    {name && <span className="font-medium text-foreground">{name}, </span>}
                    your registration for <strong>{eventTitle}</strong> has already been confirmed.
                </p>
                <p className="text-muted-foreground mb-8 text-center text-sm">
                    No further action is needed.
                </p>
                <Link href="/">
                    <Button size="lg">Go Home</Button>
                </Link>
            </div>
        );
    }

    // ── Create a fresh Stripe Checkout Session ─────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2026-01-28.clover" as any,
    });

    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";
    const checkoutTitle = eventData?.title ?? "Tournament Registration";

    // Determine amount: prefer event registrationFees, fallback to 120
    const amount: number =
        eventData?.registrationFees?.[0]?.amount
            ? Number(eventData.registrationFees[0].amount)
            : 120;

    let sessionUrl: string;

    try {
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: { name: checkoutTitle },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            metadata: {
                registrations: JSON.stringify([{ eventId, registrationId }]),
            },
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/checkout/resume?eventId=${eventId}&registrationId=${registrationId}`,
        });

        if (!session.url) throw new Error("No session URL returned from Stripe");
        sessionUrl = session.url;
    } catch {
        return <ErrorScreen message="Unable to create a payment session. Please try again or contact support." />;
    }

    redirect(sessionUrl);
}

function ErrorScreen({ message }: { message: string }) {
    return (
        <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="bg-red-100 dark:bg-red-900/30 w-24 h-24 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2 text-center">Something went wrong</h1>
            <p className="text-muted-foreground mb-8 text-center max-w-md">{message}</p>
            <Link href="/">
                <Button size="lg" variant="outline">Go Home</Button>
            </Link>
        </div>
    );
}
