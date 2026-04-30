"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";

export default function ContactPage() {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("Form submitted");
        setLoading(false);
        setSubmitted(true);
    }

    return (
        <div className="container mx-auto px-4 py-16">
            <div className="text-center mb-16">
                <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
                <p className="text-xl text-muted-foreground">
                    Have questions? We&apos;d love to hear from you.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                {/* Contact Info */}
                <div className="space-y-8">
                    <div className="flex items-start gap-4">
                        <MapPin className="w-6 h-6 text-primary mt-1" />
                        <div>
                            <h3 className="font-semibold text-lg">Visit Us</h3>
                            <p className="text-muted-foreground">
                                17910 Coventry Park Dr<br />
                                Houston, TX 77084
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <Mail className="w-6 h-6 text-primary mt-1" />
                        <div>
                            <h3 className="font-semibold text-lg">Email</h3>
                            <p className="text-muted-foreground">
                                <a href="mailto:info@burhanisportsclub.com" className="hover:underline">
                                    info@burhanisportsclub.com
                                </a>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <Phone className="w-6 h-6 text-primary mt-1" />
                        <div>
                            <h3 className="font-semibold text-lg">Phone</h3>
                            <p className="text-muted-foreground">
                                <a href="tel:+18323563002" className="hover:underline">
                                    +1 (832) 356-3002
                                </a>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Contact Form */}
                <div className="bg-card p-8 rounded-lg border shadow-sm">
                    {submitted ? (
                        <div className="text-center py-12">
                            <h3 className="text-2xl font-bold text-green-600 mb-2">Message Sent!</h3>
                            <p className="text-muted-foreground">Thank you for contacting us. We will get back to you shortly.</p>
                            <Button className="mt-6" variant="outline" onClick={() => setSubmitted(false)}>
                                Send Another Key
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">First Name</label>
                                    <Input required placeholder="John" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Last Name</label>
                                    <Input required placeholder="Doe" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Email</label>
                                <Input required type="email" placeholder="john@example.com" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Message</label>
                                <Textarea required placeholder="How can we help you?" className="min-h-[120px]" />
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? "Sending..." : "Send Message"}
                            </Button>
                        </form>
                    )}
                </div>
            </div>

            {/* Google Maps */}
            <div className="max-w-5xl mx-auto mt-12">
                <h2 className="text-2xl font-bold mb-4">Find Us on Google Maps</h2>
                <div className="rounded-2xl overflow-hidden border bg-card">
                    <iframe
                        title="Burhani Sports Club - Google Maps"
                        className="w-full h-[320px] md:h-[420px]"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src="https://www.google.com/maps?q=17910%20Coventry%20Park%20Dr%2C%20Houston%2C%20TX%2077084&output=embed"
                    />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                    Address: 17910 Coventry Park Dr, Houston, TX 77084
                </p>
            </div>
        </div>
    );
}
