"use client";

import { useEffect } from "react";

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function stripHash() {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}

/**
 * Honor `#teams` always; honor `#rsvp` only when `allowRsvpScroll` is true.
 * When `#rsvp` is present but scroll is not allowed (already RSVP'd), strip the hash.
 */
export function useSectionHashScroll(opts: {
  ready: boolean;
  allowRsvpScroll: boolean;
}) {
  const { ready, allowRsvpScroll } = opts;

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    const hash = window.location.hash.replace(/^#/, "");
    if (hash !== "rsvp" && hash !== "teams") return;

    if (hash === "rsvp" && !allowRsvpScroll) {
      stripHash();
      return;
    }

    let attempts = 0;
    const maxAttempts = 20;
    const tryScroll = () => {
      if (scrollToSection(hash)) return;
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryScroll, 50);
      }
    };
    tryScroll();
  }, [ready, allowRsvpScroll]);
}

export function needsWeeklyRsvpAutoScroll(myRsvp: {
  status: string;
  tokensHeld?: number | null;
  pendingTokenIncreaseTo?: number | null;
} | null): boolean {
  if (!myRsvp) return true;
  const pending = Number(myRsvp.pendingTokenIncreaseTo) || 0;
  const held = Number(myRsvp.tokensHeld) || 0;
  if (pending > held) return true;
  if (myRsvp.status === "CONFIRMED" || myRsvp.status === "WAITLISTED") return false;
  return true;
}
