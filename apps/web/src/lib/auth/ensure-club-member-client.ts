import type { User } from "firebase/auth";

/** Call after club Auth so Fantasy Google users are promoted to MEMBER. */
export async function ensureClubMemberSession(user: User): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch("/api/auth/ensure-club-member", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "Failed to prepare club membership");
  }
}
