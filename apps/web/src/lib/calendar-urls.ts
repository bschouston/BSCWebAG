export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";
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

export function eventPageUrl(event: { id: string; slug?: string | null }) {
  if (event.slug) return `${siteUrl()}/events/${event.slug}`;
  return `${siteUrl()}/member/events/${event.id}`;
}
