/** Canonical public club site when env/request hints are missing or local. */
export const DEFAULT_SITE_URL = "https://burhanisportsclub.com";

/** Production tracker app URL. */
export const DEFAULT_TRACKER_URL = "https://tracker.burhanisportsclub.com";

export function isLocalOrigin(url: string | null | undefined): boolean {
  return !url || /localhost|127\.0\.0\.1/i.test(url);
}

function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, "");
}

function vercelOrigin(): string | null {
  const host = process.env.VERCEL_URL;
  return host ? normalizeOrigin(`https://${host}`) : null;
}

/** Client-safe and build-time site origin (no request headers). */
export function publicSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env && !isLocalOrigin(env)) return env;
  if (typeof window !== "undefined" && !isLocalOrigin(window.location.origin)) {
    return window.location.origin;
  }
  const vercel = vercelOrigin();
  if (vercel) return vercel;
  if (env) return env;
  return DEFAULT_SITE_URL;
}

/** Server-side site origin for Stripe return URLs and absolute links. */
export function resolveSiteUrl(request?: { headers: Headers }): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const fwdHost = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
  const fwdProto = request?.headers.get("x-forwarded-proto") ?? "https";
  const headerOrigin = fwdHost ? `${fwdProto}://${fwdHost}` : null;

  if (envUrl && !isLocalOrigin(envUrl)) return envUrl;
  if (headerOrigin && !isLocalOrigin(headerOrigin)) {
    return normalizeOrigin(headerOrigin);
  }

  const vercel = vercelOrigin();
  if (vercel) return vercel;

  if (envUrl) return envUrl;
  return DEFAULT_SITE_URL;
}

/** Tracker console URL for TRACKER role redirects. */
export function publicTrackerUrl(): string {
  const env = process.env.NEXT_PUBLIC_TRACKER_URL?.replace(/\/$/, "");
  if (env && !isLocalOrigin(env)) return env;
  if (env) return env;
  return DEFAULT_TRACKER_URL;
}
