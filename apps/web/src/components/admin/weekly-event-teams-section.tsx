"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { SportEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { WEEKLY_TEAM_COLOR_PRESETS, normalizeTeamColor } from "@/lib/weekly-team-colors";

type Team = { id: string; name: string; color: string; sortOrder: number };
type Member = { rsvpId: string; userId: string; name: string; email: string | null; teamId: string | null };

function TeamColumn({
  title,
  color,
  members,
  dropTargetId,
  selectedRsvpId,
  dropReady,
  disabled,
  onMemberClick,
  onDropTarget,
  onDelete,
  canDelete,
}: {
  title: string;
  color?: string;
  members: Member[];
  dropTargetId: string;
  selectedRsvpId: string;
  dropReady: boolean;
  disabled: boolean;
  onMemberClick: (member: Member) => void;
  onDropTarget: (teamId: string | null) => void;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const isDropTarget = dropReady && !disabled;

  return (
    <div
      className={cn(
        "flex min-h-[10rem] flex-col rounded-lg border p-3 transition-shadow",
        isDropTarget && "ring-2 ring-[#1a3556] dark:ring-[#ffd700]",
        isDropTarget && "cursor-pointer"
      )}
      onClick={() => {
        if (isDropTarget) onDropTarget(dropTargetId === "unassigned" ? null : dropTargetId);
      }}
      onKeyDown={(e) => {
        if (!isDropTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDropTarget(dropTargetId === "unassigned" ? null : dropTargetId);
        }
      }}
      role={isDropTarget ? "button" : undefined}
      tabIndex={isDropTarget ? 0 : undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {color ? (
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/20 dark:border-white/30"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          ) : null}
          <p className="truncate font-semibold text-[#1a3556] dark:text-foreground">{title}</p>
          <span className="text-xs text-muted-foreground">{members.length}</span>
        </div>
        {onDelete && canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      {color ? (
        <div className="mb-2 h-1.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
      ) : null}
      {isDropTarget ? (
        <p className="mb-2 text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Tap to assign here</p>
      ) : null}
      <div className="flex flex-1 flex-col gap-2">
        {members.map((m) => {
          const selected = selectedRsvpId === m.rsvpId;
          return (
            <button
              key={m.rsvpId}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onMemberClick(m);
              }}
              className={cn(
                "min-h-11 w-full rounded-md border bg-card px-3 py-2 text-left text-sm font-medium text-[#1a3556] transition-colors dark:text-foreground",
                "disabled:cursor-default disabled:opacity-80",
                !disabled && "cursor-pointer hover:bg-muted/60",
                selected && "border-[#1a3556] bg-[#1a3556]/10 ring-2 ring-[#1a3556] dark:border-[#ffd700] dark:bg-[#ffd700]/10 dark:ring-[#ffd700]"
              )}
            >
              {m.name}
            </button>
          );
        })}
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">No players assigned</p>
        ) : null}
      </div>
    </div>
  );
}

export function WeeklyEventTeamsSection({
  eventId,
  event,
  onEventChange,
}: {
  eventId: string;
  event: SportEvent;
  onEventChange: (patch: Partial<SportEvent>) => void;
}) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(Boolean(event.teamsEnabled));
  const [locked, setLocked] = useState(Boolean(event.teamsLocked));
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(WEEKLY_TEAM_COLOR_PRESETS[1].hex);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [ackAnnounce, setAckAnnounce] = useState(false);
  const [selectedRsvpId, setSelectedRsvpId] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);
  const [pendingAssigned, setPendingAssigned] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load teams");
      setEnabled(Boolean(data.enabled));
      setLocked(Boolean(data.locked));
      setTeams(Array.isArray(data.teams) ? data.teams : []);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [eventId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    if (!user) return null;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/weekly-events/${eventId}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Action failed") as Error & { code?: string; assigned?: number };
        err.code = typeof data.code === "string" ? data.code : undefined;
        err.assigned = typeof data.assigned === "number" ? data.assigned : undefined;
        throw err;
      }
      await load();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const byTeam = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const team of teams) map.set(team.id, []);
    const unassigned: Member[] = [];
    for (const m of members) {
      if (m.teamId && map.has(m.teamId)) map.get(m.teamId)!.push(m);
      else unassigned.push(m);
    }
    return { map, unassigned };
  }, [teams, members]);

  const assignedCount = members.filter((m) => Boolean(m.teamId)).length;
  const selectedMember = members.find((m) => m.rsvpId === selectedRsvpId) ?? null;
  const interactionDisabled = locked || busy || loading;

  const toggleMemberSelect = (member: Member) => {
    if (interactionDisabled) return;
    setSelectedRsvpId((prev) => (prev === member.rsvpId ? "" : member.rsvpId));
  };

  const dropOnTeam = async (teamId: string | null) => {
    if (!selectedRsvpId || interactionDisabled) return;
    const member = members.find((m) => m.rsvpId === selectedRsvpId);
    if (!member) return;
    if ((member.teamId ?? null) === teamId) {
      setSelectedRsvpId("");
      return;
    }
    try {
      await post({ action: "assign_member", rsvpId: selectedRsvpId, teamId });
      setSelectedRsvpId("");
    } catch {
      /* error shown via setError */
    }
  };

  const disableTeams = async () => {
    try {
      await post({ action: "set_enabled", enabled: false, confirm: true });
      setEnabled(false);
      setTeams([]);
      setMembers([]);
      setSelectedRsvpId("");
      onEventChange({ teamsEnabled: false, teamsLocked: false });
      setDisableOpen(false);
    } catch {
      /* error shown via setError */
    }
  };

  const enableTeams = async () => {
    try {
      await post({ action: "set_enabled", enabled: true });
      setEnabled(true);
      onEventChange({ teamsEnabled: true });
    } catch {
      /* error shown via setError */
    }
  };

  const setEnabledChecked = async (next: boolean) => {
    if (loading || busy) return;
    if (next) {
      await enableTeams();
      return;
    }
    if (assignedCount > 0) {
      setPendingAssigned(assignedCount);
      setDisableOpen(true);
      return;
    }
    await disableTeams();
  };

  return (
    <Card className="mb-8 scroll-mt-24" id="teams">
      <CardHeader>
        <CardTitle className="text-[#1a3556] dark:text-foreground">Teams</CardTitle>
        <CardDescription>
          Tap a player to select, then tap a team to assign. Tap the selected player again to unselect.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={enabled}
              disabled={busy || loading}
              onCheckedChange={(checked) => {
                void setEnabledChecked(checked === true);
              }}
            />
            Enable team management
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading || !enabled}
            onClick={() => {
              void post({ action: "set_locked", locked: !locked })
                .then((ok) => {
                  if (ok) onEventChange({ teamsLocked: !locked });
                })
                .catch(() => undefined);
            }}
          >
            {locked ? "Unlock teams" : "Lock teams"}
          </Button>
          <Button
            type="button"
            className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={busy || loading || !enabled || teams.length === 0 || members.length === 0}
            onClick={() => {
              setAckAnnounce(false);
              setAnnounceOpen(true);
            }}
          >
            Announce teams
          </Button>
        </div>

        {locked ? (
          <p className="text-sm text-[#8a6d00] dark:text-[#ffd700]">
            Teams are locked. Nobody can change assignments until you unlock.
          </p>
        ) : null}

        {selectedMember ? (
          <p className="rounded-lg border border-[#8a6d00]/40 bg-[#8a6d00]/5 px-3 py-2 text-sm text-[#1a3556] dark:border-[#ffd700]/40 dark:bg-[#ffd700]/10 dark:text-foreground">
            Selected: <strong>{selectedMember.name}</strong> — tap a team to assign
          </p>
        ) : null}

        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-team-name">New team</Label>
            <Input
              id="new-team-name"
              value={newName}
              disabled={busy || locked || !enabled}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Team name"
            />
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKLY_TEAM_COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  disabled={busy || locked || !enabled}
                  title={c.label}
                  onClick={() => setNewColor(c.hex)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    newColor === c.hex ? "border-[#1a3556] dark:border-[#ffd700]" : "border-black/20 dark:border-white/25"
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || locked || !enabled || !newName.trim()}
            onClick={() => {
              const name = newName.trim();
              void post({ action: "create_team", name, color: normalizeTeamColor(newColor) })
                .then((ok) => {
                  if (ok) setNewName("");
                })
                .catch(() => undefined);
            }}
          >
            Add team
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : enabled ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <TeamColumn
              title="Unassigned"
              members={byTeam.unassigned}
              dropTargetId="unassigned"
              selectedRsvpId={selectedRsvpId}
              dropReady={Boolean(selectedRsvpId)}
              disabled={interactionDisabled}
              onMemberClick={toggleMemberSelect}
              onDropTarget={dropOnTeam}
            />
            {teams.map((team) => (
              <TeamColumn
                key={team.id}
                title={team.name}
                color={team.color}
                members={byTeam.map.get(team.id) ?? []}
                dropTargetId={team.id}
                selectedRsvpId={selectedRsvpId}
                dropReady={Boolean(selectedRsvpId)}
                disabled={interactionDisabled}
                onMemberClick={toggleMemberSelect}
                onDropTarget={dropOnTeam}
                canDelete={!locked && !busy}
                onDelete={() => {
                  if (confirm(`Delete ${team.name}? Players become unassigned.`)) {
                    void post({ action: "delete_team", teamId: team.id }).catch(() => undefined);
                  }
                }}
              />
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable team management?</DialogTitle>
            <DialogDescription>
              {pendingAssigned} confirmed member{pendingAssigned === 1 ? " is" : "s are"} assigned to a team.
              Disabling will clear all assignments, delete teams for this event, and hide teams on the event page.
              Re-enabling will create fresh Team Red and Team Blue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
              Keep enabled
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void disableTeams()}
            >
              {busy ? "Disabling…" : "Disable and reset teams"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={announceOpen}
        onOpenChange={(open) => {
          setAnnounceOpen(open);
          if (!open) setAckAnnounce(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email current teams to confirmed members?</DialogTitle>
            <DialogDescription>
              Everyone who has RSVP’d confirmed will get the live roster. This does not hide teams — members already see them on the event page.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox checked={ackAnnounce} onCheckedChange={(c) => setAckAnnounce(c === true)} />
            Send the team announcement email
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAnnounceOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!ackAnnounce || busy}
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              onClick={() => {
                void post({ action: "announce_teams" })
                  .then((ok) => {
                    if (ok) setAnnounceOpen(false);
                  })
                  .catch(() => undefined);
              }}
            >
              {busy ? "Sending…" : "Send emails"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
