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

export function googleSubscribeUrl(httpsFeedUrl: string) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsFeedUrl)}`;
}

export function appleSubscribeUrl(httpsFeedUrl: string) {
  return httpsFeedUrl.replace(/^https:\/\//i, "webcal://").replace(/^http:\/\//i, "webcal://");
}

export function eventPagePath(event: { id: string; slug?: string | null; category?: string | null }) {
  if (event.category === "WEEKLY_SPORTS" && event.slug) {
    return `/events/${event.slug}`;
  }
  if (event.category === "WEEKLY_SPORTS") {
    return `/member/events/${event.id}`;
  }
  if (event.slug) return `/events/${event.slug}`;
  return `/member/events/${event.id}`;
}

export function eventPageUrl(event: { id: string; slug?: string | null; category?: string | null }) {
  return `${siteUrl()}${eventPagePath(event)}`;
}
