import { getAdminDb } from "@/lib/firebase/admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";
import ResumePaymentOptions from "./payment-options";

export const dynamic = "force-dynamic";

interface PageProps {
    searchParams: Promise<{ eventId?: string; registrationId?: string }>;
}

export default async function ResumeCheckoutPage({ searchParams }: PageProps) {
    const { eventId, registrationId } = await searchParams;
    const adminDb = getAdminDb();

    // ── Validate params ────────────────────────────────────────────────────
    if (!eventId || !registrationId) {
        return (
            <ErrorScreen message="Invalid payment link. Please contact support." />
        );
    }

    // ── Fetch registration from Firestore ──────────────────────────────────
    let regData: Record<string, any> | null = null;
    let eventData: Record<string, any> | null = null;
    let loadError: string | null = null;

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
            loadError = "Registration not found. It may have been removed or the link is incorrect.";
        } else {
            regData = regSnap.data() as Record<string, any>;
            eventData = eventSnap.exists ? (eventSnap.data() as Record<string, any>) : null;
        }
    } catch {
        loadError = "Unable to load your registration. Please try again later.";
    }

    if (loadError || !regData) {
        return <ErrorScreen message={loadError ?? "Unable to load your registration."} />;
    }

    const eventTitle = eventData?.title ?? "the event";
    const name = `${regData.firstName ?? ""} ${regData.lastName ?? ""}`.trim();

    // ── Active installment plan — subscription is in progress ────────────────
    if (regData.stripeSubscriptionId && regData.paymentType === "installment") {
        const installmentsPaid: number = regData.installmentsPaid ?? 0;
        const totalInstallments: number = regData.totalInstallments ?? 3;
        const isFullyPaid = regData.paymentStatus === "paid";

        return (
            <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center min-h-[60vh]">
                <div className={`${isFullyPaid ? "bg-green-100 dark:bg-green-900/30" : "bg-blue-100 dark:bg-blue-900/30"} w-24 h-24 rounded-full flex items-center justify-center mb-6`}>
                    <CheckCircle2 className={`h-12 w-12 ${isFullyPaid ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`} />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-center">
                    {isFullyPaid ? "Registration Fully Paid!" : "Installment Plan Active"}
                </h1>
                <p className="text-muted-foreground mb-2 text-center max-w-md">
                    {name && <span className="font-medium text-foreground">{name}, </span>}
                    {isFullyPaid
                        ? <>all {totalInstallments} payments have been received for <strong>{eventTitle}</strong>.</>
                        : <>{installmentsPaid} of {totalInstallments} monthly payments completed for <strong>{eventTitle}</strong>. Your next payment will be charged automatically.</>
                    }
                </p>
                <p className="text-muted-foreground mb-8 text-center text-sm">
                    You will receive an email confirmation after each payment. No further action is needed.
                </p>
                <Link href="/">
                    <Button size="lg">Go Home</Button>
                </Link>
            </div>
        );
    }

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

    // ── Show payment action (full payment only) ───────────────────────────────
    const amount: number =
        eventData?.registrationFees?.[0]?.amount
            ? Number(eventData.registrationFees[0].amount)
            : 120;

    // Build edit URL based on the event's registration form
    const formId =
      typeof eventData?.registrationFormId === "string"
        ? eventData.registrationFormId.trim()
        : "";
    const registrationFormType: string = eventData?.registrationFormType ?? "";
    const editBasePath = formId
      ? `/register/f/${formId}`
      : registrationFormType === "volleyball"
        ? "/register/f/volleyball"
        : registrationFormType === "dynamic" && formId
          ? `/register/f/${formId}`
          : null;
    const editUrl = editBasePath
        ? `${editBasePath}?eventId=${eventId}&edit=${registrationId}`
        : null;

    return (
        <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-bold mb-2">Complete Your Registration</h1>
                <p className="text-muted-foreground max-w-sm">
                    Complete payment for your spot at <strong>{eventTitle}</strong>.
                </p>
            </div>

            <ResumePaymentOptions
                eventId={eventId}
                registrationId={registrationId}
                eventTitle={eventTitle}
                amount={amount}
                name={name}
                editUrl={editUrl}
            />
        </div>
    );
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
