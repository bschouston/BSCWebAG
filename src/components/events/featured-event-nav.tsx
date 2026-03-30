"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";

type SectionKey = "details" | "highlights" | "fees" | "donate" | "players";

export function FeaturedEventNav({
    showHighlights,
    showFees,
    showDonate,
    showPlayers,
}: {
    showHighlights: boolean;
    showFees: boolean;
    showDonate: boolean;
    showPlayers: boolean;
}) {
    const items = useMemo(() => {
        const base: Array<{ key: SectionKey; label: string; show: boolean }> = [
            { key: "details", label: "Details", show: true },
            { key: "highlights", label: "Highlights", show: showHighlights },
            { key: "fees", label: "Fees", show: showFees },
            { key: "donate", label: "Donate", show: showDonate },
            { key: "players", label: "Registered Players", show: showPlayers },
        ];
        return base.filter((i) => i.show);
    }, [showDonate, showFees, showHighlights, showPlayers]);

    if (items.length <= 1) return null;

    const jumpTo = (id: SectionKey) => {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background/80 backdrop-blur border-y">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {items.map((item) => (
                    <Button
                        key={item.key}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-full"
                        onClick={() => jumpTo(item.key)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}

