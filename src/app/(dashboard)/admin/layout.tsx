"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { Loader2 } from "lucide-react";

export default function AdminLayout({
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
        if (profile && profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN") {
            router.replace("/");
        }
    }, [user, profile, loading, router]);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user || (profile && profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN")) {
        return null;
    }

    return (
        <div className="flex flex-1">
            <aside className="hidden md:block h-[calc(100vh-4rem)] sticky top-16">
                <AdminSidebar />
            </aside>
            <main className="flex-1 p-8 overflow-y-auto h-[calc(100vh-4rem)]">
                {children}
            </main>
        </div>
    );
}
