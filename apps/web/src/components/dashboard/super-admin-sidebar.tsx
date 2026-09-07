"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, CreditCard, Coins, Wallet, BarChart3, ArrowLeft, Upload } from "lucide-react";

const sidebarItems = [
    { href: "/super-admin", icon: LayoutDashboard, label: "Overview" },
    { href: "/admin/members", icon: Users, label: "User Management" },
    { href: "/super-admin/token-pricing", icon: Coins, label: "Token Pricing" },
    { href: "/super-admin/token-reports", icon: BarChart3, label: "Token Reports" },
    { href: "/super-admin/token-transactions", icon: Wallet, label: "Token Transactions" },
    { href: "/super-admin/billing", icon: CreditCard, label: "Dollar Transactions" },
    { href: "/super-admin/legacy-token-import", icon: Upload, label: "Legacy token import" },
];

export function SuperAdminSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-64 border-r bg-sidebar h-full flex flex-col overflow-y-auto">
            <div className="p-6">
                <h2 className="text-lg font-bold tracking-tight text-primary">Super Admin</h2>
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {sidebarItems.map((item) => {
                    const active =
                        item.href === "/super-admin"
                            ? pathname === "/super-admin"
                            : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={active ? "secondary" : "ghost"}
                            className={cn(
                                "w-full justify-start",
                                active && "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                        >
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t">
                <Link href="/admin">
                    <Button variant="outline" className="w-full justify-start">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        To Admin Panel
                    </Button>
                </Link>
            </div>
        </div>
    );
}
