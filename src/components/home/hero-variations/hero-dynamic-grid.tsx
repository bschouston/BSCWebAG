"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { SportEvent, NewsArticle } from "@/types";

interface HeroDynamicGridProps {
    upcomingEvents: SportEvent[];
    featuredEvent: SportEvent | null;
    latestNews: NewsArticle | null;
}

export function HeroDynamicGrid({ upcomingEvents, featuredEvent, latestNews }: HeroDynamicGridProps) {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="w-full bg-muted/20 py-12 md:py-24">
            <div className="container mx-auto px-4">
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 gap-4 md:grid-cols-4 md:grid-rows-2 md:h-[600px]"
                >
                    {/* Main Hero Block */}
                    <motion.div variants={item} className="col-span-1 md:col-span-2 md:row-span-2 relative overflow-hidden rounded-3xl bg-primary p-8 text-primary-foreground flex flex-col justify-between group">
                        {/* 3D Emblem Logo */}
                        <div className="absolute top-4 right-4 md:top-6 md:right-6 lg:top-8 lg:right-8 opacity-100 transition-transform duration-700 hover:scale-105 z-10 select-none">
                            <div className="relative w-24 h-24 lg:w-56 lg:h-56">
                                {/* Intense Glow effect behind logo */}
                                <div className="absolute inset-0 bg-white/40 blur-3xl rounded-full transform scale-90"></div>
                                <Image
                                    src="/images/bsclogo.png"
                                    alt="BSC Logo"
                                    fill
                                    className="object-contain relative z-10"
                                    style={{
                                        filter: "drop-shadow(0 20px 13px rgba(0, 0, 0, 0.6)) drop-shadow(0 8px 5px rgba(0, 0, 0, 0.4)) brightness(1.1)"
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="inline-flex items-center rounded-full bg-primary-foreground/10 px-3 py-1 text-sm font-medium backdrop-blur-sm">
                                Burhani Sports Club
                            </div>
                            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
                                Championing <br /> Sports Excellence
                            </h1>
                            <p className="mt-4 max-w-sm text-primary-foreground/80">
                                Join Houston's premier sports community. Participate in tournaments, find teammates, and track your progress.
                            </p>
                        </div>
                        <div className="mt-8">
                            <Button size="lg" variant="secondary" className="w-full sm:w-auto font-bold" asChild>
                                <Link href="/register">
                                    Join the Club <ArrowUpRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </motion.div>

                    {/* Upcoming Events Block */}
                    <motion.div variants={item} className="relative bg-card rounded-3xl p-6 border shadow-sm hover:shadow-md transition-all flex flex-col justify-between items-start group">
                        <div className="w-full flex justify-between items-start">
                            <div className="p-3 bg-green-500/10 rounded-full text-green-600 group-hover:bg-green-500/20 transition-colors">
                                <CalendarDays className="h-6 w-6" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">Next Event</span>
                        </div>

                        <div className="mt-2 w-full">
                            {upcomingEvents.length > 0 ? (
                                <>
                                    <h3 className="text-lg font-bold line-clamp-2 leading-tight">
                                        {upcomingEvents[0].title}
                                    </h3>
                                    <p className="text-muted-foreground text-sm mt-1">
                                        {new Date(upcomingEvents[0].startTime as unknown as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </p>
                                </>
                            ) : (
                                <p className="text-muted-foreground text-sm">No upcoming events scheduled.</p>
                            )}
                        </div>

                        <Link href="/events" className="absolute inset-0 rounded-3xl ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            <span className="sr-only">View all events</span>
                        </Link>
                    </motion.div>

                    {/* Latest News Block */}
                    <motion.div variants={item} className="relative md:col-span-1 bg-card rounded-3xl p-6 border shadow-sm flex flex-col justify-between hover:shadow-md transition-all group">
                        {latestNews ? (
                            <>
                                <div>
                                    <div className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        <TrendingUp className="h-4 w-4 text-primary" /> Latest News
                                    </div>
                                    <h3 className="text-lg font-bold leading-snug line-clamp-3">{latestNews.title}</h3>
                                </div>
                                <Link href={`/news/${latestNews.id}`} className="mt-3 text-sm font-medium text-primary flex items-center gap-1 hover:underline">
                                    Read More <ArrowUpRight className="h-3 w-3" />
                                </Link>
                            </>
                        ) : (
                            <div className="flex flex-col h-full justify-center items-center text-muted-foreground">
                                <TrendingUp className="h-8 w-8 mb-2 opacity-20" />
                                <p>No recent news</p>
                            </div>
                        )}
                    </motion.div>

                    {/* Feature Event Block */}
                    <motion.div variants={item} className="md:col-span-2 bg-black text-white rounded-3xl p-8 border shadow-sm relative overflow-hidden group flex flex-col justify-end min-h-[200px]">
                        {featuredEvent ? (
                            <>
                                {/* Background Image Overlay - Use event image or fallback */}
                                <div className="absolute inset-0 bg-cover bg-center opacity-60 group-hover:scale-105 transition-transform duration-700"
                                    style={{ backgroundImage: `url('${featuredEvent.imageUrl || "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2000&auto=format&fit=crop"}')` }}>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>

                                <div className="relative z-10">
                                    <div className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-green-400">
                                        <CalendarDays className="h-3 w-3" /> Featured Event
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">{featuredEvent.title}</h3>
                                    <p className="text-white/80 text-sm mb-4 line-clamp-2 max-w-md">
                                        {featuredEvent.description || "Join us for this featured event."}
                                    </p>
                                    <Button size="sm" className="rounded-full bg-white text-black hover:bg-white/90 font-semibold" asChild>
                                        <Link href={`/events/${featuredEvent.id}`}>View Details</Link>
                                    </Button>
                                </div>
                            </>
                        ) : (
                            // Fallback if no featured event found - Show general events link
                            <>
                                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-105 transition-transform duration-700"></div>
                                <div className="relative z-10">
                                    <h3 className="text-2xl font-bold mb-2">Explore All Events</h3>
                                    <p className="text-white/80 text-sm mb-4">Discover upcoming tournaments and activities.</p>
                                    <Button size="sm" className="rounded-full bg-white text-black hover:bg-white/90 font-semibold" asChild>
                                        <Link href="/events">Browse Calendar</Link>
                                    </Button>
                                </div>
                            </>
                        )}

                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
