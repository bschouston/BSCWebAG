"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SuperAdminSidebar } from "@/components/dashboard/super-admin-sidebar";
import { Loader2 } from "lucide-react";

export default function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        if (profile && profile.role !== "SUPER_ADMIN") {
            router.replace("/admin");
        }
    }, [user, profile, loading, router]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user || (profile && profile.role !== "SUPER_ADMIN")) {
        return null;
    }

    return (
        <div className="flex h-screen bg-background">
            <div className="hidden md:flex flex-col w-64 fixed inset-y-0 z-50">
                <SuperAdminSidebar />
            </div>
            <main className="flex-1 md:pl-64 flex flex-col overflow-y-auto">
                <div className="flex-1 p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
