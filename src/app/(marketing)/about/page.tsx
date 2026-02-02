import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AboutPage() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <div className="mb-12 text-center">
                <h1 className="text-4xl font-bold mb-4">About Burhani Sports Club</h1>
                <p className="text-xl text-muted-foreground">
                    Fostering unity, fitness, and sportsmanship since 2010.
                </p>
            </div>

            <div className="prose dark:prose-invert lg:prose-xl mx-auto space-y-8">
                <section>
                    <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
                    <p className="text-lg leading-relaxed">
                        Burhani Sports Club (BSC) is dedicated to promoting physical well-being and community bonding through organized sports.
                        We provide improved facilities and regular events to encourage members of all ages to stay active and healthy.
                        Our focus goes beyond just games; we aim to build a supportive environment where sportsmanship and brotherhood thrive.
                    </p>
                </section>

                <section className="grid md:grid-cols-2 gap-8 my-12">
                    <div className="p-6 bg-muted rounded-lg">
                        <h3 className="text-xl font-bold mb-2">Community First</h3>
                        <p>We believe sports bring people together. Our events are designed to be inclusive and fun for everyone.</p>
                    </div>
                    <div className="p-6 bg-muted rounded-lg">
                        <h3 className="text-xl font-bold mb-2">Excellence</h3>
                        <p>We strive for quality in our tournaments, coaching, and facilities to give our members the best experience.</p>
                    </div>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4">Our History</h2>
                    <p>
                        Founded by a group of passionate sports enthusiasts, BSC started with casual weekend cricket matches.
                        Over the years, we have expanded to include Badger, Volleyball, Futsal, and Swimming.
                        Today, we are proud to host city-wide tournaments and regular weekly leagues.
                    </p>
                </section>

                <div className="flex justify-center mt-12">
                    <Link href="/contact">
                        <Button size="lg">Get in Touch</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
