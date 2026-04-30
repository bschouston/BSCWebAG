"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AdminSidebar } from "@/components/dashboard/admin-sidebar";
import { AccessDenied } from "@/components/auth/access-denied";
import { Loader2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace("/login");
            return;
        }
    }, [user, profile, loading, router]);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    if (profile && profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN") {
        return <AccessDenied />;
    }

    return (
        <div className="flex flex-1">
            {/* Desktop sidebar */}
            <aside className="hidden md:block h-[calc(100vh-4rem)] sticky top-16 shrink-0">
                <AdminSidebar />
            </aside>

            {/* Mobile sidebar trigger + sheet */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg bg-background border"
                        aria-label="Open menu"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-64">
                    <AdminSidebar />
                </SheetContent>
            </Sheet>

            <main className="flex-1 p-4 md:p-8 overflow-y-auto min-h-[calc(100vh-4rem)]">
                {children}
            </main>
        </div>
    );
}
