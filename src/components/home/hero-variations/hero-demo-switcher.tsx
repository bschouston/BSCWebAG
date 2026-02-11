"use client";

import { useState } from "react";
import { HeroCinematicSplit } from "./hero-cinematic-split";
import { HeroImmersiveGlow } from "./hero-immersive-glow";
import { HeroDynamicGrid } from "./hero-dynamic-grid";
import { Button } from "@/components/ui/button";

export function HeroDemoSwitcher() {
    const [activeVariation, setActiveVariation] = useState<"A" | "B" | "C">("A");

    return (
        <div className="flex flex-col">
            {/* Control Panel - Sticky at top or just above */}
            <div className="w-full bg-muted border-b z-50 p-2 flex items-center justify-center gap-4">
                <span className="text-sm font-medium">Hero Variations:</span>
                <div className="flex bg-background rounded-lg border p-1">
                    <Button
                        variant={activeVariation === "A" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setActiveVariation("A")}
                        className="text-xs"
                    >
                        A: Cinematic Split
                    </Button>
                    <Button
                        variant={activeVariation === "B" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setActiveVariation("B")}
                        className="text-xs"
                    >
                        B: Immersive Glow
                    </Button>
                    <Button
                        variant={activeVariation === "C" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setActiveVariation("C")}
                        className="text-xs"
                    >
                        C: Dynamic Grid
                    </Button>
                </div>
            </div>

            {/* Hero Render */}
            <div className="min-h-[500px]">
                {activeVariation === "A" && <HeroCinematicSplit />}
                {activeVariation === "B" && <HeroImmersiveGlow />}
                {activeVariation === "C" && <HeroDynamicGrid upcomingEvents={[]} featuredEvent={null} latestNews={null} />}
            </div>
        </div>
    );
}
