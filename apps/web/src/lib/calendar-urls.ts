import { publicSiteUrl } from "./site-url";

export function siteUrl() {
  return publicSiteUrl();
}

export function clubIcsUrl() {
  return `${siteUrl()}/api/calendar/club.ics`;
}

export function personalIcsUrl(token: string) {
  return `${siteUrl()}/api/calendar/me/${encodeURIComponent(token)}.ics`;
}

/**
 * One-click “subscribe” for Google Calendar.
 * Google’s cid handler historically ignores or fails on https:// feed URLs;
 * use http:// in the query (Google still fetches the feed over HTTPS) and the
 * render endpoint, which is more reliable than /calendar/r?cid=.
 */
export function googleSubscribeUrl(httpsFeedUrl: string) {
  const forCid = httpsFeedUrl.replace(/^https:\/\//i, "http://");
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(forCid)}`;
}

export function appleSubscribeUrl(httpsFeedUrl: string) {
  return httpsFeedUrl.replace(/^https:\/\//i, "webcal://").replace(/^http:\/\//i, "webcal://");
}

export type EventPageHash = "rsvp" | "teams" | null;

function withHash(path: string, hash: EventPageHash | undefined, weeklyDefault: boolean) {
  const resolved =
    hash !== undefined ? hash : weeklyDefault ? ("rsvp" as const) : null;
  return resolved ? `${path}#${resolved}` : path;
}

/** Path to the public or member event page. Weekly sports default to `#rsvp`. */
export function eventPagePath(
  event: { id: string; slug?: string | null; category?: string | null },
  opts?: { hash?: EventPageHash }
) {
  const weekly = event.category === "WEEKLY_SPORTS";
  if (weekly && event.slug) {
    return withHash(`/events/${event.slug}`, opts?.hash, true);
  }
  if (weekly) {
    return withHash(`/member/events/${event.id}`, opts?.hash, true);
  }
  if (event.slug) return withHash(`/events/${event.slug}`, opts?.hash, false);
  return withHash(`/member/events/${event.id}`, opts?.hash, false);
}

export function eventPageUrl(
  event: { id: string; slug?: string | null; category?: string | null },
  opts?: { hash?: EventPageHash }
) {
  return `${siteUrl()}${eventPagePath(event, opts)}`;
}
