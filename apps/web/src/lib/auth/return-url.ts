/** Allow only same-origin relative paths for post-login redirects. */
export function sanitizeReturnPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  return trimmed;
}

export function postLoginHref(next: string | null | undefined): string {
  const safe = sanitizeReturnPath(next);
  return safe ? `/post-login?next=${encodeURIComponent(safe)}` : "/post-login";
}

export function loginHref(next: string | null | undefined): string {
  const safe = sanitizeReturnPath(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
