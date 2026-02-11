"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileModeToggle } from "@/components/mobile-mode-toggle";
import { useAuth } from "@/lib/auth-context";
import { UserNav } from "@/components/user-nav";

interface MobileNavProps {
    items: {
        title: string;
        href: string;
    }[];
}

export function MobileNav({ items }: MobileNavProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const { user, loading } = useAuth();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent body scroll when menu is open
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    const toggleMenu = () => setIsOpen(!isOpen);

    const MenuContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, x: "100%" }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm"
                >
                    <div className="flex h-full flex-col p-4">
                        <div className="flex items-center justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleMenu}
                                aria-label="Close Menu"
                            >
                                <X className="h-6 w-6" />
                            </Button>
                        </div>

                        <div className="flex flex-1 flex-col items-center justify-center space-y-8">
                            <nav className="flex flex-col items-center space-y-6 text-lg font-medium">
                                {items.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className="transition-colors hover:text-foreground/80 text-foreground"
                                    >
                                        {item.title}
                                    </Link>
                                ))}
                                {/* Additional mobile-specific links could go here */}
                            </nav>

                            <div className="flex flex-col items-center space-y-4">
                                <MobileModeToggle />
                                {loading ? (
                                    <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                                ) : user ? (
                                    <div onClick={() => setIsOpen(false)}>
                                        <UserNav />
                                    </div>
                                ) : (
                                    <div className="flex flex-col space-y-2 w-full items-center">
                                        <Link href="/login" onClick={() => setIsOpen(false)}>
                                            <Button variant="ghost" className="w-full">
                                                Log in
                                            </Button>
                                        </Link>
                                        <Link href="/register" onClick={() => setIsOpen(false)}>
                                            <Button className="w-full">Join Now</Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <div className="md:hidden">
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleMenu}
                aria-label="Toggle Menu"
            >
                <Menu className="h-6 w-6" />
            </Button>
            {mounted && createPortal(MenuContent, document.body)}
        </div>
    );
}
