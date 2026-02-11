"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowRight, Calendar, MapPin } from "lucide-react";
import { motion } from "framer-motion";

export function HeroCinematicSplit() {
    return (
        <section className="relative w-full overflow-hidden bg-background">
            <div className="container relative z-10 mx-auto grid min-h-[85vh] grid-cols-1 lg:grid-cols-2">
                {/* Left Content */}
                <div className="flex flex-col justify-center px-4 py-16 lg:px-8 lg:py-0">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6 flex items-center space-x-2"
                    >
                        <Badge variant="outline" className="px-3 py-1 text-sm font-medium border-primary/20 bg-primary/5 text-primary">
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Registration Open for 2026 Season
                        </Badge>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="mb-4 text-5xl font-extrabold tracking-tight text-foreground sm:text-7xl"
                    >
                        Unleash Your <span className="text-primary">Potential</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="mb-8 max-w-lg text-lg text-muted-foreground sm:text-xl"
                    >
                        Join the Burhani Sports Club community. Experience world-class events, professional training, and a supportive environment for all skill levels.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex flex-wrap gap-4"
                    >
                        <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20 transition-transform hover:scale-105" asChild>
                            <Link href="/register">
                                Join Now <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button size="lg" variant="outline" className="h-12 px-8 text-base hover:bg-muted" asChild>
                            <Link href="/events">Explore Events</Link>
                        </Button>
                    </motion.div>

                    {/* Trust Indicators / Stats */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                        className="mt-12 flex items-center gap-8 border-t pt-8 text-muted-foreground"
                    >
                        <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-foreground">50+</span>
                                <span className="text-xs">Annual Events</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <MapPin className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-foreground">Houston</span>
                                <span className="text-xs">Local Community</span>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Right Visual */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    className="relative hidden lg:block"
                >
                    {/* Abstract Shape Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" style={{ clipPath: "polygon(10% 0, 100% 0, 100% 100%, 0% 100%)" }}></div>

                    <div className="absolute inset-0 flex items-center justify-center p-12">
                        {/* 
                Placeholder for a high-quality Hero Image. 
                Using a gradient box with overlay for now if no image is available, 
                but ideally this is a dynamic action shot.
            */}
                        <div className="relative h-full w-full overflow-hidden rounded-2xl border bg-muted shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-tr from-black/60 to-transparent z-10"></div>
                            <div className="absolute bottom-0 left-0 p-8 z-20 text-white">
                                <p className="text-sm font-medium uppercase tracking-wider opacity-80">Featured Event</p>
                                <h3 className="text-3xl font-bold mt-1">Winter Cricket Championship</h3>
                                <p className="mt-2 text-white/80 line-clamp-2">The biggest tournament of the year is here. Register your team today.</p>
                            </div>
                            {/* Visual Pattern / Texture */}
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1531415074984-618d2623f9b1?q=80&w=2574&auto=format&fit=crop')] bg-cover bg-center transition-transform duration-1000 hover:scale-105"></div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
