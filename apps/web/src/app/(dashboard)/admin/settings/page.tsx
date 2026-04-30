import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminSettingsPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Admin Settings</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Global Configurations</CardTitle>
                    <CardDescription>Manage application-wide settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Settings configuration panel coming soon.</p>
                </CardContent>
            </Card>
        </div>
    );
}
