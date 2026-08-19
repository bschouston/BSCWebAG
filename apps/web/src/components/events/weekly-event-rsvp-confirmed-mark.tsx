"use client";

import { CheckCircle2 } from "lucide-react";

export function WeeklyEventRsvpConfirmedMark() {
  return (
    <span
      className="weekly-rsvp-confirmed-mark relative ml-auto flex shrink-0 items-center gap-2.5 rounded-full border-2 border-[color:var(--mz-gold)] bg-gradient-to-r from-[color:var(--mz-navy-deep)] via-[color:var(--mz-navy)] to-[#163a5c] px-3 py-2 shadow-[0_8px_28px_-8px_color-mix(in_srgb,var(--mz-navy)_55%,transparent)] md:gap-3 md:px-4 md:py-2.5"
      role="status"
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-full bg-[color:var(--mz-teal)]/20 animate-ping"
        style={{ animationDuration: "2.6s" }}
        aria-hidden
      />
      <span
        className="weekly-rsvp-confirmed-glow pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r from-[color:var(--mz-gold)]/35 via-[color:var(--mz-teal)]/25 to-[color:var(--mz-gold)]/35 blur-md"
        aria-hidden
      />
      <CheckCircle2
        className="relative h-8 w-8 shrink-0 text-[color:var(--mz-gold)] drop-shadow-[0_0_10px_color-mix(in_srgb,var(--mz-gold)_70%,transparent)] md:h-9 md:w-9"
        strokeWidth={2.75}
        aria-hidden
      />
      <span className="relative whitespace-nowrap text-sm font-extrabold uppercase tracking-[0.12em] text-[color:var(--mz-gold)] md:text-base">
        RSVP Confirmed
      </span>
    </span>
  );
}
