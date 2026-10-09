import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/auth/server-auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { notifyWeeklyTeamsAnnounced } from "@/lib/notify";
import {
  WEEKLY_TEAMS_COLLECTION,
  assertNotFinished,
  assertWeeklyEvent,
  clearCaptainIfMatches,
  clearRsvpTeamId,
  countAssignedTeamMembers,
  ensureDefaultWeeklyTeams,
  loadConfirmedTeamMembers,
  loadWeeklyTeams,
  nextTeamSortOrder,
  resetWeeklyTeams,
} from "@/lib/weekly-event-teams";
import { normalizeTeamColor } from "@/lib/weekly-team-colors";
import { chicagoTimeLabel, weeklyEventTraceLabel } from "@/lib/weekly-rsvp";

export const dynamic = "force-dynamic";

function actionError(code: string) {
  const messages: Record<string, string> = {
    NOT_WEEKLY: "Not a weekly event",
    OCCURRENCE_DONE: "This event is already completed or cancelled",
    TEAMS_LOCKED: "Teams are locked",
    TEAMS_DISABLED: "Team management is not enabled",
    HAS_ASSIGNMENTS: "Members are assigned to teams",
    TEAM_NOT_FOUND: "Team not found",
    RSVP_NOT_FOUND: "RSVP not found",
    NOT_CONFIRMED: "Only confirmed members can be assigned to a team",
    CAPTAIN_NOT_ON_TEAM: "Captain must be a confirmed member on this team",
  };
  const status = code === "OCCURRENCE_DONE" || code === "TEAMS_LOCKED" ? 400 : 400;
  return NextResponse.json({ error: messages[code] || code, code }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id: eventId } = await params;
  const adminDb = getAdminDb();
  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventSnap.data() ?? {};
  if (event.category !== "WEEKLY_SPORTS") return actionError("NOT_WEEKLY");

  let teams = await loadWeeklyTeams(adminDb, eventId);
  if (event.teamsEnabled && teams.length === 0) {
    teams = await ensureDefaultWeeklyTeams(adminDb, eventId);
  }
  const members = await loadConfirmedTeamMembers(adminDb, eventId);

  return NextResponse.json({
    enabled: Boolean(event.teamsEnabled),
    locked: Boolean(event.teamsLocked),
    announcedAt: event.teamsAnnouncedAt?.toDate?.()?.toISOString?.() ?? null,
    teams,
    members,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAdmin(request);
  if (error || !user) return error;
  const { id: eventId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action || "");
  const adminDb = getAdminDb();
  const eventRef = adminDb.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = eventSnap.data() ?? {};

  try {
    assertWeeklyEvent(event);
    assertNotFinished(event);
  } catch (err) {
    const code = err instanceof Error ? err.message : "FAILED";
    return actionError(code);
  }

  const locked = Boolean(event.teamsLocked);
  const teamsCol = eventRef.collection(WEEKLY_TEAMS_COLLECTION);

  try {
    if (action === "set_enabled") {
      const enabled = Boolean(body.enabled);
      if (!enabled) {
        const assigned = await countAssignedTeamMembers(adminDb, eventId);
        if (assigned > 0 && body.confirm !== true) {
          return NextResponse.json(
            {
              error: `${assigned} confirmed member${assigned === 1 ? " is" : "s are"} assigned to a team. Confirm to disable team management.`,
              code: "HAS_ASSIGNMENTS",
              assigned,
            },
            { status: 409 }
          );
        }
      }
      await eventRef.update({
        teamsEnabled: enabled,
        ...(enabled
          ? { updatedAt: FieldValue.serverTimestamp() }
          : {
              teamsLocked: false,
              teamsAnnouncedAt: null,
              updatedAt: FieldValue.serverTimestamp(),
            }),
      });
      if (enabled) {
        await ensureDefaultWeeklyTeams(adminDb, eventId);
      } else {
        await resetWeeklyTeams(adminDb, eventId);
      }
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.teams_enabled",
        meta: { eventId, enabled },
      });
      return NextResponse.json({ ok: true, enabled });
    }

    if (action === "set_locked") {
      const nextLocked = Boolean(body.locked);
      await eventRef.update({
        teamsLocked: nextLocked,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: nextLocked ? "weekly.teams_lock" : "weekly.teams_unlock",
        meta: { eventId, locked: nextLocked },
      });
      return NextResponse.json({ ok: true, locked: nextLocked });
    }

    if (action === "announce_teams") {
      const [teams, members] = await Promise.all([
        loadWeeklyTeams(adminDb, eventId),
        loadConfirmedTeamMembers(adminDb, eventId),
      ]);
      if (teams.length === 0) {
        return NextResponse.json({ error: "Create teams before announcing" }, { status: 400 });
      }
      const start = event.startTime?.toDate?.() ?? null;
      const startLabel = start ? chicagoTimeLabel(start) : "";
      const roster = teams.map((team) => {
        const onTeam = members.filter((m) => m.teamId === team.id);
        const captain = team.captainUserId
          ? onTeam.find((m) => m.userId === team.captainUserId)
          : null;
        return {
          name: team.name,
          color: team.color,
          captainName: captain?.name ?? null,
          members: onTeam.map((m) => m.name),
        };
      });
      for (const member of members) {
        if (!member.email) continue;
        const assigned = teams.find((t) => t.id === member.teamId);
        notifyWeeklyTeamsAnnounced({
          to: member.email,
          name: member.name,
          eventTitle: weeklyEventTraceLabel(event),
          eventId,
          startLabel,
          yourTeam: assigned?.name ?? "Unassigned",
          yourTeamColor: assigned?.color ?? null,
          roster,
        }).catch((e) => console.error("teams announce email", e));
      }
      await eventRef.update({
        teamsAnnouncedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAdminAudit({
        adminUid: user.uid,
        targetUid: `event:${eventId}`,
        action: "weekly.teams_announce",
        meta: { eventId, recipients: members.filter((m) => m.email).length },
      });
      return NextResponse.json({ ok: true, sent: members.filter((m) => m.email).length });
    }

    if (locked && action !== "set_locked") {
      return actionError("TEAMS_LOCKED");
    }

    if (action === "create_team") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
      const existing = await loadWeeklyTeams(adminDb, eventId);
      const ref = teamsCol.doc();
      await ref.set({
        name,
        color: normalizeTeamColor(body.color),
        sortOrder: existing.length,
        captainUserId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!event.teamsEnabled) {
        await eventRef.update({ teamsEnabled: true, updatedAt: FieldValue.serverTimestamp() });
      }
      return NextResponse.json({
        ok: true,
        team: {
          id: ref.id,
          name,
          color: normalizeTeamColor(body.color),
          sortOrder: existing.length,
          captainUserId: null,
        },
      });
    }

    if (action === "update_team") {
      const teamId = String(body.teamId || "");
      if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });
      const snap = await teamsCol.doc(teamId).get();
      if (!snap.exists) return actionError("TEAM_NOT_FOUND");
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
      if (body.color != null) patch.color = normalizeTeamColor(body.color);
      if ("captainUserId" in body) {
        if (body.captainUserId === null || body.captainUserId === "") {
          patch.captainUserId = null;
        } else if (typeof body.captainUserId === "string") {
          const captainUid = body.captainUserId.trim();
          const members = await loadConfirmedTeamMembers(adminDb, eventId);
          const onTeam = members.find((m) => m.userId === captainUid && m.teamId === teamId);
          if (!onTeam) return actionError("CAPTAIN_NOT_ON_TEAM");
          patch.captainUserId = captainUid;
        } else {
          return NextResponse.json({ error: "captainUserId must be a string or null" }, { status: 400 });
        }
      }
      await snap.ref.update(patch);
      const updated = await loadWeeklyTeams(adminDb, eventId);
      const team = updated.find((t) => t.id === teamId) ?? null;
      return NextResponse.json({ ok: true, team });
    }

    if (action === "delete_team") {
      const teamId = String(body.teamId || "");
      if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });
      const snap = await teamsCol.doc(teamId).get();
      if (!snap.exists) return actionError("TEAM_NOT_FOUND");
      await clearRsvpTeamId(adminDb, eventId, teamId);
      await snap.ref.delete();
      return NextResponse.json({ ok: true });
    }

    if (action === "assign_member") {
      const rsvpId = String(body.rsvpId || "");
      const teamId = body.teamId === null || body.teamId === "" ? null : String(body.teamId || "");
      if (!rsvpId) return NextResponse.json({ error: "rsvpId required" }, { status: 400 });
      const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
      const rsvpSnap = await rsvpRef.get();
      if (!rsvpSnap.exists || rsvpSnap.data()?.eventId !== eventId) return actionError("RSVP_NOT_FOUND");
      const rsvpData = rsvpSnap.data()!;
      if (rsvpData.status !== "CONFIRMED") return actionError("NOT_CONFIRMED");
      if (teamId) {
        const teamSnap = await teamsCol.doc(teamId).get();
        if (!teamSnap.exists) return actionError("TEAM_NOT_FOUND");
      }
      const prevTeamId =
        typeof rsvpData.teamId === "string" && rsvpData.teamId ? rsvpData.teamId : null;
      const userId = String(rsvpData.userId || "");
      const teamSortOrder = teamId
        ? prevTeamId === teamId && typeof rsvpData.teamSortOrder === "number"
          ? rsvpData.teamSortOrder
          : await nextTeamSortOrder(adminDb, eventId, teamId, rsvpId)
        : null;
      await rsvpRef.update({ teamId, teamSortOrder, updatedAt: FieldValue.serverTimestamp() });
      if (prevTeamId && prevTeamId !== teamId && userId) {
        await clearCaptainIfMatches(adminDb, eventId, prevTeamId, userId);
      }
      return NextResponse.json({ ok: true, teamId, teamSortOrder });
    }

    if (action === "reorder_members") {
      const teamId = String(body.teamId || "");
      const rsvpIds = Array.isArray(body.rsvpIds)
        ? body.rsvpIds.filter((id): id is string => typeof id === "string" && Boolean(id))
        : [];
      if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });
      const teamSnap = await teamsCol.doc(teamId).get();
      if (!teamSnap.exists) return actionError("TEAM_NOT_FOUND");
      let i = 0;
      for (const rsvpId of rsvpIds) {
        const rsvpRef = adminDb.collection("event_rsvps").doc(rsvpId);
        const rsvpSnap = await rsvpRef.get();
        if (!rsvpSnap.exists || rsvpSnap.data()?.eventId !== eventId) return actionError("RSVP_NOT_FOUND");
        if (rsvpSnap.data()?.status !== "CONFIRMED") return actionError("NOT_CONFIRMED");
        if (rsvpSnap.data()?.teamId !== teamId) {
          return NextResponse.json({ error: "All players must be on this team" }, { status: 400 });
        }
        await rsvpRef.update({ teamSortOrder: i, updatedAt: FieldValue.serverTimestamp() });
        i += 1;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("weekly teams", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
