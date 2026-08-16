export const SITE_ROLES = ["MEMBER", "ADMIN", "SUPER_ADMIN"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

export type MemberAccessLabel =
  | "Member"
  | "Fantasy"
  | "Fantasy Admin"
  | "Tracker"
  | "Tracker Admin";

export type MemberAccessSource = {
  role?: string | null;
  isFantasyUser?: boolean;
  isFantasyAdmin?: boolean;
  isGoogleTracker?: boolean;
  isTrackerDevice?: boolean;
  isTrackerAdmin?: boolean;
};

export function isClubMemberRole(role: unknown): role is SiteRole {
  return role === "MEMBER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

export function memberAccessLabels(user: MemberAccessSource): MemberAccessLabel[] {
  const labels: MemberAccessLabel[] = [];
  if (isClubMemberRole(user.role)) labels.push("Member");
  if (user.isFantasyUser === true) labels.push("Fantasy");
  if (user.isFantasyAdmin === true) labels.push("Fantasy Admin");
  if (
    user.isGoogleTracker === true ||
    user.isTrackerDevice === true ||
    user.role === "TRACKER"
  ) {
    labels.push("Tracker");
  }
  if (user.isTrackerAdmin === true) labels.push("Tracker Admin");
  return labels;
}

export function memberMatchesAccessFilter(
  labels: MemberAccessLabel[],
  filter: string
): boolean {
  if (filter === "all") return true;
  if (filter === "fantasy") {
    return labels.includes("Fantasy") || labels.includes("Fantasy Admin");
  }
  if (filter === "tracker") {
    return labels.includes("Tracker") || labels.includes("Tracker Admin");
  }
  return true;
}
