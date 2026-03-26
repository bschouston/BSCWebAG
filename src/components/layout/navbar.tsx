"use client";

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context";
import { UserNav } from "@/components/user-nav";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ModeToggle } from "@/components/mode-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useCart } from "@/lib/cart-context";
import { ShoppingCart } from "lucide-react";

export function Navbar() {
    const { user, loading } = useAuth();
    const { items } = useCart();

    const [featuredEvents, setFeaturedEvents] = useState<{title: string, href: string}[]>([]);

    useEffect(() => {
        const fetchFeatured = async () => {
            try {
                const q = query(
                    collection(db, "events"),
                    where("category", "==", "FEATURED_EVENTS"),
                    where("status", "==", "PUBLISHED"),
                    where("isPublic", "==", true),
                    orderBy("startTime", "asc"),
                    limit(2)
                );
                const snap = await getDocs(q);
                const events = snap.docs.map(doc => {
                    const data = doc.data();
                    return {
                        title: data.title,
                        href: `/events/${data.slug || doc.id}`
                    };
                });
                setFeaturedEvents(events);
            } catch (error) {
                console.error("Failed to fetch featured events:", error);
            }
        };
        fetchFeatured();
    }, []);

    const baseNavItems = [
        { title: "About", href: "/about" },
        { title: "Contact", href: "/contact" },
    ];

    const navItems = [...featuredEvents, ...baseNavItems];

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-16 items-center px-4 justify-between">
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

                {/* Desktop Navigation Links */}
                <nav className="hidden md:flex flex-1 items-center justify-center space-x-6 text-sm font-medium">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="transition-colors hover:text-foreground/80 text-foreground/60"
                        >
                            {item.title}
                        </Link>
                    ))}
                </nav>

                {/* Right Actions: Theme Toggle + Auth (Desktop) */}
                <div className="hidden md:flex items-center space-x-4">
                    <ModeToggle />
                    
                    <Link href="/cart" className="relative text-foreground/60 hover:text-foreground/80 flex items-center justify-center p-2">
                        <ShoppingCart className="h-5 w-5" />
                        {items.length > 0 && (
                            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                                {items.length}
                            </span>
                        )}
                    </Link>

                    {!loading && user && <UserNav />}
                </div>

                {/* Mobile Navigation */}
                <MobileNav items={navItems} />
            </div>
        </header>
    )
}
