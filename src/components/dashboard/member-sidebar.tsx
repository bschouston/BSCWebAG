"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, Home, User, ShoppingCart, Wallet } from "lucide-react";

const sidebarItems = [
    { href: "/member", icon: Home, label: "Dashboard" },
    { href: "/member/events", icon: Calendar, label: "My Events" },
    { href: "/member/shop", icon: ShoppingCart, label: "Shop" },
    { href: "/member/wallet", icon: Wallet, label: "Wallet" },
    { href: "/member/profile", icon: User, label: "Profile" },
];

export function MemberSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-64 border-r bg-sidebar h-full flex flex-col">
            <div className="p-6">
                <h2 className="text-lg font-bold tracking-tight text-sidebar-foreground">Member Zone</h2>
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {sidebarItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                        <Button
                            variant={pathname === item.href ? "secondary" : "ghost"}
                            className={cn("w-full justify-start", pathname === item.href && "bg-sidebar-accent text-sidebar-accent-foreground")}
                        >
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.label}
                        </Button>
                    </Link>
                ))}
            </nav>
        </div>
    );
}
