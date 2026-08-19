"use client";

import { Calendar, Clock, ExternalLink, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function WeeklyEventWhenWhere({
  dateLabel,
  timeLabel,
  locationId,
  addressUrl,
}: {
  dateLabel: string;
  timeLabel: string;
  locationId?: string | null;
  addressUrl?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
          aria-hidden
        />
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <Calendar className="mt-0.5 h-6 w-6 shrink-0 text-[#1a3556] dark:text-[#ffd700]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
              Date
            </p>
            <p className="mt-0.5 text-lg font-bold leading-snug text-[#1a3556] dark:text-foreground sm:text-xl">
              {dateLabel}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
          aria-hidden
        />
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-[#8a6d00] dark:text-[#ffd700]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
              Time
            </p>
            <p className="mt-0.5 text-lg font-bold leading-snug text-[#1a3556] dark:text-foreground sm:text-xl">
              {timeLabel}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
          aria-hidden
        />
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-[#1a3556] dark:text-[#ffd700]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
              Location
            </p>
            <p className="mt-0.5 text-lg font-bold leading-snug text-[#1a3556] dark:text-foreground sm:text-xl">
              {locationId || "TBA"}
            </p>
            {addressUrl ? (
              <a
                href={addressUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center text-xs font-medium text-primary hover:underline sm:text-sm"
              >
                Open in Maps <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
