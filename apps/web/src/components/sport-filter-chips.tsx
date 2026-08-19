"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sportFilterLabel } from "@/lib/sport-filter-storage";

type CatalogSport = { slug: string; id: string; label: string };

export function SportFilterChips({
  sportIds,
  selectedSports,
  sports,
  onToggle,
  onClear,
}: {
  sportIds: string[];
  selectedSports: string[];
  sports: CatalogSport[];
  onToggle: (sportId: string) => void;
  onClear: () => void;
}) {
  if (sportIds.length === 0) return null;
  const active = selectedSports.length > 0;

  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#1a3556] dark:text-foreground">Filter by sport</p>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            Show all sports
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {sportIds.map((sportId) => {
          const selected = selectedSports.includes(sportId);
          return (
            <Button
              key={sportId}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className={cn(
                "rounded-full",
                selected
                  ? "border-transparent bg-[#1a3556] text-white hover:bg-[#122540] dark:bg-[#ffd700] dark:text-[#122540] dark:hover:bg-white"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
              aria-pressed={selected}
              onClick={() => onToggle(sportId)}
            >
              {sportFilterLabel(sportId, sports)}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {active
          ? "Showing selected sports only. Your choices are saved for next visit."
          : "Select one or more sports to narrow the list. Leave unselected to see all."}
      </p>
    </div>
  );
}
