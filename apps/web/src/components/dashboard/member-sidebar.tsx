"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Calendar, Home, User, Wallet } from "lucide-react";

const sidebarItems = [
  { href: "/member", icon: Home, label: "My Dashboard" },
  { href: "/member/events", icon: Calendar, label: "My Events" },
  { href: "/member/wallet", icon: Wallet, label: "My Wallet" },
  { href: "/member/profile", icon: User, label: "My Profile" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/member") return pathname === "/member";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberSidebar() {
  const pathname = usePathname();

  return (
    <div className="mz-sidebar flex h-full w-64 flex-col overflow-y-auto">
      <div className="p-6 pb-4">
        <p className="mz-kicker">BSC Houston</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white">Member Zone</h2>
        <div className="mz-rule mz-rule-sidebar mt-3" />
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-6">
        {sidebarItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("mz-nav-link", active && "mz-nav-link-active")}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
