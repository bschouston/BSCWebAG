import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BillingPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Billing Management</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Invoices & Plans</CardTitle>
                    <CardDescription>Manage club subscriptions and billing details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Billing management features coming soon.</p>
                </CardContent>
            </Card>
        </div>
    );
}
