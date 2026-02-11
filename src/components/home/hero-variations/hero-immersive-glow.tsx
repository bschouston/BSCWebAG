"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, PlayCircle } from "lucide-react";

export function HeroImmersiveGlow() {
    return (
        <section className="relative flex min-h-[80vh] w-full flex-col items-center justify-center overflow-hidden bg-black text-center text-white">
            {/* Dynamic Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-600/30 blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/30 blur-[120px] animate-pulse delay-1000"></div>
                <div className="absolute top-[40%] left-[50%] h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="mx-auto max-w-4xl"
                >
                    <div className="mb-6 flex justify-center">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80 backdrop-blur-sm transition-colors hover:bg-white/10">
                            <span className="mr-2 flex h-2 w-2 rounded-full bg-green-500"></span>
                            New Season Registration Open
                            <ChevronRight className="ml-1 h-3 w-3" />
                        </span>
                    </div>

                    <h1 className="bg-gradient-to-b from-white via-white/90 to-white/50 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-7xl md:text-8xl">
                        Elevate Your Game.
                    </h1>

                    <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60 sm:text-xl">
                        Join a premier sports community dedicated to excellence, fitness, and recurring competitive events in Houston.
                    </p>

                    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <Button size="xl" className="h-14 min-w-[180px] rounded-full text-lg font-semibold bg-white text-black hover:bg-white/90 transform transition-all hover:scale-105" asChild>
                            <Link href="/register">
                                Start Journey
                            </Link>
                        </Button>
                        <Button size="xl" variant="outline" className="h-14 min-w-[180px] rounded-full border-white/20 bg-white/5 text-lg text-white backdrop-blur-sm hover:bg-white/10" asChild>
                            <Link href="/events" className="flex items-center gap-2">
                                <PlayCircle className="h-5 w-5" />
                                Watch Highlights
                            </Link>
                        </Button>
                    </div>
                </motion.div>
            </div>

            {/* Scroll indicator */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30"
            >
                <div className="h-10 w-6 rounded-full border-2 border-white/20 flex justify-center p-2">
                    <div className="h-1 w-1 rounded-full bg-white"></div>
                </div>
            </motion.div>
        </section>
    );
}
