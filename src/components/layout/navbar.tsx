"use client";

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context";
import { UserNav } from "@/components/user-nav";
import { ModeToggle } from "@/components/mode-toggle";

export function Navbar() {
    const { user, loading } = useAuth();

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-16 items-center px-4">
                {/* Logo Section */}
                <Link href="/" className="mr-6 flex items-center space-x-2">
                    <Image
                        src="/images/bsclogo.png"
                        alt="Burhani Sports Club"
                        width={200}
                        height={60}
                        className="h-12 w-auto object-contain"
                        priority
                    />
                </Link>

                {/* Navigation Links - Centered */}
                <nav className="flex flex-1 items-center justify-center space-x-6 text-sm font-medium">
                    <Link href="/events" className="transition-colors hover:text-foreground/80 text-foreground/60">
                        Events
                    </Link>
                    <Link href="/news" className="transition-colors hover:text-foreground/80 text-foreground/60">
                        News
                    </Link>
                    <Link href="/about" className="transition-colors hover:text-foreground/80 text-foreground/60">
                        About
                    </Link>
                    <Link href="/contact" className="transition-colors hover:text-foreground/80 text-foreground/60">
                        Contact
                    </Link>
                </nav>

                {/* Right Actions: Theme Toggle + Auth */}
                <div className="flex items-center space-x-4">
                    <ModeToggle />

                    {loading ? (
                        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                    ) : user ? (
                        <UserNav />
                    ) : (
                        <>
                            <Link href="/login">
                                <Button variant="ghost" size="sm">
                                    Log in
                                </Button>
                            </Link>
                            <Link href="/register">
                                <Button size="sm">Join Now</Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}
