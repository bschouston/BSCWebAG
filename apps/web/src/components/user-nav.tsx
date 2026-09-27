"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Calendar, LayoutDashboard, LogOut, User, Shield, Wallet } from "lucide-react";

type UserNavProps = {
  variant?: "dropdown" | "inline";
  onNavigate?: () => void;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
};

export function UserNav({ variant = "dropdown", onNavigate }: UserNavProps) {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut();
    router.push("/");
  };

  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : user.email?.substring(0, 2).toUpperCase() || "U";

  const isClubRole =
    profile?.role === "MEMBER" ||
    profile?.role === "ADMIN" ||
    profile?.role === "SUPER_ADMIN";

  const items: NavItem[] = [
    { href: "/member", label: "My Dashboard", icon: LayoutDashboard },
  ];
  if (isClubRole) {
    items.push(
      { href: "/member/events", label: "My Events", icon: Calendar },
      { href: "/member/wallet", label: "My Wallet", icon: Wallet },
      { href: "/member/profile", label: "My Profile", icon: User }
    );
  }
  if (profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN") {
    items.push({ href: "/admin", label: "Admin Panel", icon: Shield });
  }
  if (profile?.role === "SUPER_ADMIN") {
    items.push({
      href: "/super-admin",
      label: "Super Admin Panel",
      icon: Shield,
      iconClassName: "text-primary",
    });
  }

  if (variant === "inline") {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="px-1 text-left">
          <p className="text-sm font-medium text-foreground">{user.displayName || "User"}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onNavigate?.()}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Icon className={`h-5 w-5 shrink-0 ${item.iconClassName ?? ""}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center gap-3 rounded-md px-2 py-2.5 text-left text-base font-medium text-red-600 transition-colors hover:bg-muted dark:text-red-400"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Log out</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.photoURL || ""} alt={user.displayName || "User"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="z-[200] w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <Icon className={`mr-2 h-4 w-4 ${item.iconClassName ?? ""}`} />
                  <span>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()} className="text-red-600 focus:text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
