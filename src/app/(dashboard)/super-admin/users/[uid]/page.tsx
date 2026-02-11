"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { UserProfile, Role } from "@/types";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
// import { useToast } from "@/hooks/use-toast"; // Assuming existing toast hook
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function UserDetailPage({ params }: { params: Promise<{ uid: string }> }) {
    const { uid } = use(params);
    const { user: authUser, loading: authLoading } = useAuth();
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const { toast } = useToast() || { toast: ({ title, description }: any) => alert(`${title}: ${description}`) }; // Fallback

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role>("MEMBER");

    useEffect(() => {
        if (authLoading) return;

        const fetchUser = async () => {
            try {
                const token = await authUser?.getIdToken();
                const headers: HeadersInit = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }

                const res = await fetch(`/api/admin/users/${uid}`, { headers });
                if (!res.ok) throw new Error("Failed to fetch user");
                const data = await res.json();
                setUser(data);
                setSelectedRole(data.role || "MEMBER");
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, [uid, authUser, authLoading]);

    const handleRoleUpdate = async () => {
        setSaving(true);
        try {
            const token = await authUser?.getIdToken();
            const headers: HeadersInit = { "Content-Type": "application/json" };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch(`/api/admin/users/${uid}/role`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ role: selectedRole }),
            });

            if (!res.ok) throw new Error("Failed to update role");

            // toast({ title: "Success", description: "User role updated successfully" });
            router.refresh();
        } catch (error) {
            console.error(error);
            // toast({ title: "Error", description: "Failed to update role", variant: "destructive" });
            alert("Failed to update role");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;
    if (!user) return <div className="p-8">User not found</div>;

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/super-admin/users">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Users
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Edit User</CardTitle>
                    <CardDescription>Manage user role and permissions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <div className="p-2 border rounded-md bg-muted/50">
                            {user.firstName} {user.lastName}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Email</Label>
                        <div className="p-2 border rounded-md bg-muted/50">
                            {user.email}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                            value={selectedRole}
                            onValueChange={(val) => setSelectedRole(val as Role)}
                            disabled={saving}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MEMBER">Member</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                            </SelectContent>
                        </Select>
                        {/* Note: 'admin' needs to be 'ADMIN' to match types? Check types again. */}
                    </div>

                    <div className="pt-4">
                        <Button onClick={handleRoleUpdate} disabled={saving}>
                            {saving ? "Saving..." : "Save Role"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
