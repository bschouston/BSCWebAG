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
import { LayoutDashboard, LogOut, Settings, User, Shield, CreditCard } from "lucide-react";

export function UserNav() {
    const { user, profile, signOut } = useAuth();
    const router = useRouter();

    if (!user) return null;

    const handleSignOut = async () => {
        await signOut();
        router.push("/");
    };

    const initials = user.displayName
        ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2)
        : (user.email?.substring(0, 2).toUpperCase() || "U");

    const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";

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
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName || "User"}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                        <Link href="/member">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Dashboard</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/member/wallet">
                            <CreditCard className="mr-2 h-4 w-4" />
                            <span>Wallet</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/member/profile">
                            <User className="mr-2 h-4 w-4" />
                            <span>Profile</span>
                        </Link>
                    </DropdownMenuItem>

                    {(profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN") && (
                        <DropdownMenuItem asChild>
                            <Link href="/admin">
                                <Shield className="mr-2 h-4 w-4" />
                                <span>Admin Panel</span>
                            </Link>
                        </DropdownMenuItem>
                    )}

                    {profile?.role === "SUPER_ADMIN" && (
                        <DropdownMenuItem asChild>
                            <Link href="/super-admin">
                                <Shield className="mr-2 h-4 w-4 text-primary" />
                                <span>Super Admin Panel</span>
                            </Link>
                        </DropdownMenuItem>
                    )}

                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
