"use client";

import { Calendar, Clock, ExternalLink, MapPin, Ticket, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  effectiveRsvpWindowState,
  resolveRsvpCancelClosesAt,
  rsvpCancelDiffersFromClose,
  type RsvpManualOverride,
} from "@/lib/rsvp-window";
import { chicagoTimeLabel } from "@/lib/weekly-rsvp";

export function WeeklyEventWhenWhere({
  dateLabel,
  timeLabel,
  locationId,
  addressUrl,
  confirmedCount,
  waitlistCount,
  capacity,
  rsvpOpensAt,
  rsvpClosesAt,
  rsvpCancelClosesAt,
  rsvpManualOverride,
  status,
}: {
  dateLabel: string;
  timeLabel: string;
  locationId?: string | null;
  addressUrl?: string | null;
  confirmedCount?: number | null;
  waitlistCount?: number | null;
  capacity?: number | null;
  rsvpOpensAt?: unknown;
  rsvpClosesAt?: unknown;
  rsvpCancelClosesAt?: unknown;
  rsvpManualOverride?: RsvpManualOverride | null;
  status?: string | null;
}) {
  const confirmed = Math.max(0, Math.floor(Number(confirmedCount) || 0));
  const waitlist = Math.max(0, Math.floor(Number(waitlistCount) || 0));
  const cap = Math.max(0, Math.floor(Number(capacity) || 0));
  const showRsvpFill = confirmedCount != null || waitlistCount != null || capacity != null;
  const opensLabel = chicagoTimeLabel(rsvpOpensAt);
  const closesLabel = chicagoTimeLabel(rsvpClosesAt);
  const showRsvpWindow = opensLabel !== "—" || closesLabel !== "—";
  const showCancel =
    showRsvpWindow &&
    rsvpCancelDiffersFromClose({ rsvpCancelClosesAt, rsvpClosesAt });
  const cancelLabel = showCancel
    ? chicagoTimeLabel(resolveRsvpCancelClosesAt({ rsvpCancelClosesAt, rsvpClosesAt }))
    : null;
  const windowState =
    status === "COMPLETED" || status === "CANCELLED"
      ? "closed"
      : effectiveRsvpWindowState({
          opensAt: rsvpOpensAt,
          closesAt: rsvpClosesAt,
          override: rsvpManualOverride ?? null,
        });
  const statusPill =
    windowState === "open"
      ? { label: "Open", className: "border-transparent bg-[color:var(--mz-teal)] text-white" }
      : windowState === "closed"
        ? {
            label: "Closed",
            className:
              "border-transparent bg-muted text-foreground dark:bg-white/15 dark:text-white",
          }
        : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {showRsvpFill ? (
          <Card className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
              aria-hidden
            />
            <CardContent className="flex items-start gap-3 p-4 sm:p-5">
              <Users className="mt-0.5 h-6 w-6 shrink-0 text-[color:var(--mz-teal)] dark:text-[#5ec9c4]" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
                  RSVPs
                </p>
                <p className="mt-0.5 text-lg font-bold leading-snug tabular-nums text-[#1a3556] dark:text-foreground sm:text-xl">
                  {cap > 0 ? `${confirmed} / ${cap}` : `${confirmed}`}
                </p>
                {waitlist > 0 ? (
                  <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                    {waitlist} waitlisted
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                    confirmed
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showRsvpWindow ? (
          <Card className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#ffd700] to-transparent opacity-70"
              aria-hidden
            />
            <CardContent className="flex items-start gap-3 p-4 sm:p-5">
              <Ticket className="mt-0.5 h-6 w-6 shrink-0 text-[#1a3556] dark:text-[#ffd700]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d00] dark:text-[#ffd700]">
                    RSVP window
                  </p>
                  {statusPill ? (
                    <Badge className={`rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wide ${statusPill.className}`}>
                      {statusPill.label}
                    </Badge>
                  ) : null}
                </div>
                <dl className="mt-1.5 space-y-1.5 text-sm leading-snug text-[#1a3556] dark:text-foreground">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Opens</dt>
                    <dd className="font-semibold">{opensLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Closes</dt>
                    <dd className="font-semibold">{closesLabel}</dd>
                  </div>
                  {showCancel && cancelLabel ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Cancel until</dt>
                      <dd className="font-semibold">{cancelLabel}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
