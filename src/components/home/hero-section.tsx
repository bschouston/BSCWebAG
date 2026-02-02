import Link from "next/link"
import { Button } from "@/components/ui/button"

export function HeroSection() {
    return (
        <section className="relative overflow-hidden bg-primary text-primary-foreground py-24 md:py-32">
            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="flex flex-col items-center space-y-4 text-center">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                            Welcome to Burhani Sports Club
                        </h1>
                        <p className="mx-auto max-w-[700px] text-primary-foreground/80 md:text-xl">
                            Fostering community through sports, fitness, and recurring events. Join us today to participate in our weekly and monthly activities.
                        </p>
                    </div>
                    <div className="space-x-4">
                        <Link href="/register">
                            <Button size="lg" variant="secondary" className="font-semibold">
                                Join Now
                            </Button>
                        </Link>
                        <Link href="/events">
                            <Button size="lg" variant="outline" className="bg-transparent text-primary-foreground border-primary-foreground hover:bg-primary-foreground hover:text-primary">
                                View Events
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
            {/* Abstract background elements could go here */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary to-transparent opacity-50 pointer-events-none" />
        </section>
    )
}
