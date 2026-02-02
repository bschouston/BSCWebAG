"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, LayoutDashboard, Users, Settings, ClipboardList } from "lucide-react";

const sidebarItems = [
    { href: "/admin", icon: LayoutDashboard, label: "Overview" },
    { href: "/admin/events", icon: Calendar, label: "Manage Events" },
    { href: "/admin/rsvps", icon: ClipboardList, label: "RSVP Manager" },
    { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-64 border-r bg-sidebar h-full flex flex-col">
            <div className="p-6">
                <h2 className="text-lg font-bold tracking-tight text-destructive">Admin Zone</h2>
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
