import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/auth/server-auth";
import { weeklyOccurrenceFinished } from "@/lib/weekly-rsvp";
import { loadConfirmedTeamMembers, loadWeeklyTeams } from "@/lib/weekly-event-teams";
import type { WeeklyTeamsPublicResponse } from "@/lib/weekly-team-colors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const adminDb = getAdminDb();
  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventSnap.data() ?? {};
  if (event.category !== "WEEKLY_SPORTS") {
    return NextResponse.json({ error: "Not a weekly event" }, { status: 400 });
  }

  const enabled = Boolean(event.teamsEnabled);
  const locked = Boolean(event.teamsLocked);
  const finished = weeklyOccurrenceFinished({
    category: "WEEKLY_SPORTS",
    status: typeof event.status === "string" ? event.status : null,
  });

  if (!enabled) {
    const empty: WeeklyTeamsPublicResponse = {
      enabled: false,
      locked,
      announcedAt: null,
      teams: [],
      unassigned: [],
      myTeamId: null,
      canJoin: false,
    };
    return NextResponse.json(empty);
  }

  const decoded = await verifyAuth(request);
  const [teams, members] = await Promise.all([
    loadWeeklyTeams(adminDb, eventId),
    loadConfirmedTeamMembers(adminDb, eventId),
  ]);

  const my = decoded ? members.find((m) => m.userId === decoded.uid) : undefined;
  const body: WeeklyTeamsPublicResponse = {
    enabled: true,
    locked,
    announcedAt: event.teamsAnnouncedAt?.toDate?.()?.toISOString?.() ?? null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      sortOrder: team.sortOrder,
      members: members.filter((m) => m.teamId === team.id).map((m) => ({ userId: m.userId, name: m.name })),
    })),
    unassigned: members
      .filter((m) => !m.teamId)
      .map((m) => ({ userId: m.userId, name: m.name })),
    myTeamId: my?.teamId ?? null,
    canJoin: Boolean(my) && !locked && !finished,
  };
  return NextResponse.json(body);
}
