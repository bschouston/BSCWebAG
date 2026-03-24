import { VolleyballRegistrationForm } from "@/components/forms/volleyball-registration";
import { Suspense } from "react";

export default function VoluntaryRegistrationPage() {
    return (
        <div className="min-h-screen bg-muted/20 py-12 px-4 md:px-0">
            <div className="max-w-4xl mx-auto space-y-6">
                <Suspense fallback={<div className="text-center p-8">Loading form...</div>}>
                    <VolleyballRegistrationForm />
                </Suspense>
            </div>
        </div>
    );
}
