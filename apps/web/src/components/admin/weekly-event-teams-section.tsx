"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Crown, GripVertical, Pencil, Trash2 } from "lucide-react";
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

type Team = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  captainUserId: string | null;
};
type Member = {
  rsvpId: string;
  userId: string;
  name: string;
  email: string | null;
  teamId: string | null;
  teamSortOrder: number;
};

function sortMembers(list: Member[]) {
  return [...list].sort(
    (a, b) =>
      a.teamSortOrder - b.teamSortOrder ||
      a.name.localeCompare(b.name) ||
      a.rsvpId.localeCompare(b.rsvpId)
  );
}

function TeamColumn({
  title,
  color,
  captainUserId,
  members,
  dropTargetId,
  selectedRsvpId,
  dropReady,
  disabled,
  canEdit,
  canReorderPlayers,
  dragOverRsvpId,
  onMemberClick,
  onDropTarget,
  onDelete,
  canDelete,
  onSaveEdit,
  onSetCaptain,
  onMovePlayer,
  onPlayerDragStart,
  onPlayerDragOver,
  onPlayerDragLeave,
  onPlayerDrop,
}: {
  title: string;
  color?: string;
  captainUserId?: string | null;
  members: Member[];
  dropTargetId: string;
  selectedRsvpId: string;
  dropReady: boolean;
  disabled: boolean;
  canEdit?: boolean;
  canReorderPlayers?: boolean;
  dragOverRsvpId?: string | null;
  onMemberClick: (member: Member) => void;
  onDropTarget: (teamId: string | null) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  onSaveEdit?: (patch: { name: string; color: string }) => Promise<void>;
  onSetCaptain?: (userId: string | null) => void;
  onMovePlayer?: (rsvpId: string, dir: -1 | 1) => void;
  onPlayerDragStart?: (rsvpId: string) => void;
  onPlayerDragOver?: (rsvpId: string) => void;
  onPlayerDragLeave?: () => void;
  onPlayerDrop?: (rsvpId: string) => void;
}) {
  const isDropTarget = dropReady && !disabled;
  const isTeam = dropTargetId !== "unassigned";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(title);
  const [editColor, setEditColor] = useState(color || WEEKLY_TEAM_COLOR_PRESETS[1].hex);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEditName(title);
      setEditColor(color || WEEKLY_TEAM_COLOR_PRESETS[1].hex);
    }
  }, [title, color, editing]);

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
        <div className="flex shrink-0 items-center gap-0.5">
          {canEdit && onSaveEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
              }}
              aria-label={`Edit ${title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {onDelete && canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete ${title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      {color ? (
        <div className="mb-2 h-1.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
      ) : null}

      {editing && onSaveEdit ? (
        <div
          className="mb-3 space-y-2 rounded-md border bg-muted/30 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={editName}
            disabled={savingEdit}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Team name"
          />
          <div className="flex flex-wrap gap-1.5">
            {WEEKLY_TEAM_COLOR_PRESETS.map((c) => (
              <button
                key={c.hex}
                type="button"
                disabled={savingEdit}
                title={c.label}
                onClick={() => setEditColor(c.hex)}
                className={`h-7 w-7 rounded-full border-2 ${
                  editColor === c.hex ? "border-[#1a3556] dark:border-[#ffd700]" : "border-black/20 dark:border-white/25"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-[#1a3556] text-white disabled:bg-muted disabled:text-foreground disabled:opacity-100 dark:bg-[#ffd700] dark:text-[#122540]"
              disabled={savingEdit || !editName.trim()}
              onClick={() => {
                void (async () => {
                  setSavingEdit(true);
                  try {
                    await onSaveEdit({ name: editName.trim(), color: normalizeTeamColor(editColor) });
                    setEditing(false);
                  } catch {
                    /* error shown via setError */
                  } finally {
                    setSavingEdit(false);
                  }
                })();
              }}
            >
              {savingEdit ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingEdit}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {isDropTarget ? (
        <p className="mb-2 text-xs font-medium text-[#8a6d00] dark:text-[#ffd700]">Tap to assign here</p>
      ) : null}
      <div className="flex flex-1 flex-col gap-2">
        {members.map((m, index) => {
          const selected = selectedRsvpId === m.rsvpId;
          const isCaptain = Boolean(captainUserId && m.userId === captainUserId);
          const showReorder = Boolean(canReorderPlayers && isTeam && members.length > 1);
          return (
            <div
              key={m.rsvpId}
              className={cn(
                "space-y-1 rounded-md",
                dragOverRsvpId === m.rsvpId && "ring-2 ring-[#8a6d00] dark:ring-[#ffd700]"
              )}
              onDragOver={(e) => {
                if (!showReorder) return;
                e.preventDefault();
                e.stopPropagation();
                onPlayerDragOver?.(m.rsvpId);
              }}
              onDragLeave={() => onPlayerDragLeave?.()}
              onDrop={(e) => {
                if (!showReorder) return;
                e.preventDefault();
                e.stopPropagation();
                onPlayerDrop?.(m.rsvpId);
              }}
            >
              <div
                className={cn(
                  "flex min-h-11 items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm font-medium text-[#1a3556] transition-colors dark:text-foreground",
                  !disabled && "hover:bg-muted/60",
                  selected &&
                    "border-[#1a3556] bg-[#1a3556]/10 ring-2 ring-[#1a3556] dark:border-[#ffd700] dark:bg-[#ffd700]/10 dark:ring-[#ffd700]",
                  disabled && "opacity-80"
                )}
              >
                {showReorder ? (
                  <button
                    type="button"
                    draggable={!disabled}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      onPlayerDragStart?.(m.rsvpId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="hidden h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted/80 active:cursor-grabbing md:flex"
                    title="Drag to reorder"
                    aria-label={`Drag ${m.name} to reorder`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMemberClick(m);
                  }}
                  className={cn(
                    "min-w-0 flex-1 rounded px-1 py-1 text-left",
                    "disabled:cursor-default",
                    !disabled && "cursor-pointer"
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{m.name}</span>
                    {isCaptain ? (
                      <span className="rounded-full bg-[#8a6d00]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6d00] dark:bg-[#ffd700]/20 dark:text-[#ffd700]">
                        Captain
                      </span>
                    ) : null}
                  </span>
                </button>
                {isTeam && onSetCaptain ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 w-8 shrink-0 px-0",
                      isCaptain
                        ? "text-[#8a6d00] hover:text-[#8a6d00] dark:text-[#ffd700] dark:hover:text-[#ffd700]"
                        : "text-muted-foreground hover:text-[#8a6d00] dark:hover:text-[#ffd700]"
                    )}
                    disabled={disabled}
                    title={isCaptain ? "Remove captain" : "Make captain"}
                    aria-label={isCaptain ? `Remove ${m.name} as captain` : `Make ${m.name} captain`}
                    aria-pressed={isCaptain}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetCaptain(isCaptain ? null : m.userId);
                    }}
                  >
                    <Crown className={cn("h-4 w-4", isCaptain && "fill-current")} />
                  </Button>
                ) : null}
                {showReorder ? (
                  <div className="flex shrink-0 flex-row items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-7 px-0"
                      disabled={disabled || index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMovePlayer?.(m.rsvpId, -1);
                      }}
                      aria-label={`Move ${m.name} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-7 px-0"
                      disabled={disabled || index === members.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMovePlayer?.(m.rsvpId, 1);
                      }}
                      aria-label={`Move ${m.name} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
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
  const [dragRsvpId, setDragRsvpId] = useState<string | null>(null);
  const [dragOverRsvpId, setDragOverRsvpId] = useState<string | null>(null);

  const normalizeTeams = (raw: unknown[]): Team[] =>
    raw.map((t, i) => {
      const row = t as Record<string, unknown>;
      return {
        id: String(row.id || ""),
        name: String(row.name || "Team"),
        color: normalizeTeamColor(row.color),
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : i,
        captainUserId:
          typeof row.captainUserId === "string" && row.captainUserId.trim()
            ? row.captainUserId.trim()
            : null,
      };
    });

  const normalizeMembers = (raw: unknown[]): Member[] =>
    raw.map((m) => {
      const row = m as Record<string, unknown>;
      return {
        rsvpId: String(row.rsvpId || ""),
        userId: String(row.userId || ""),
        name: String(row.name || "Member"),
        email: typeof row.email === "string" ? row.email : null,
        teamId: typeof row.teamId === "string" && row.teamId ? row.teamId : null,
        teamSortOrder: typeof row.teamSortOrder === "number" ? row.teamSortOrder : 1_000_000,
      };
    });

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
      setTeams(Array.isArray(data.teams) ? normalizeTeams(data.teams) : []);
      setMembers(Array.isArray(data.members) ? normalizeMembers(data.members) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [eventId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, opts?: { reload?: boolean }) => {
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
      if (opts?.reload !== false) await load();
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
    for (const [id, list] of map) map.set(id, sortMembers(list));
    return { map, unassigned: sortMembers(unassigned) };
  }, [teams, members]);

  const assignedCount = members.filter((m) => Boolean(m.teamId)).length;
  const selectedMember = members.find((m) => m.rsvpId === selectedRsvpId) ?? null;
  const interactionDisabled = locked || busy || loading;

  const toggleMemberSelect = (member: Member) => {
    if (interactionDisabled) return;
    setSelectedRsvpId((prev) => (prev === member.rsvpId ? "" : member.rsvpId));
  };

  const clearCaptainLocally = (teamId: string, userId: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId && t.captainUserId === userId ? { ...t, captainUserId: null } : t))
    );
  };

  const dropOnTeam = async (teamId: string | null) => {
    if (!selectedRsvpId || interactionDisabled) return;
    const member = members.find((m) => m.rsvpId === selectedRsvpId);
    if (!member) return;
    if ((member.teamId ?? null) === teamId) {
      setSelectedRsvpId("");
      return;
    }
    const rsvpId = selectedRsvpId;
    const prevMembers = members;
    const prevTeams = teams;
    const prevTeamId = member.teamId;
    const nextOrder =
      teamId == null
        ? 1_000_000
        : Math.max(
            -1,
            ...members.filter((m) => m.teamId === teamId && m.rsvpId !== rsvpId).map((m) => m.teamSortOrder)
          ) + 1;
    setMembers((list) =>
      list.map((m) => (m.rsvpId === rsvpId ? { ...m, teamId, teamSortOrder: nextOrder } : m))
    );
    if (prevTeamId && prevTeamId !== teamId) {
      clearCaptainLocally(prevTeamId, member.userId);
    }
    setSelectedRsvpId("");
    try {
      const data = await post({ action: "assign_member", rsvpId, teamId }, { reload: false });
      if (typeof data?.teamSortOrder === "number") {
        setMembers((list) =>
          list.map((m) => (m.rsvpId === rsvpId ? { ...m, teamSortOrder: data.teamSortOrder } : m))
        );
      }
    } catch {
      setMembers(prevMembers);
      setTeams(prevTeams);
    }
  };

  const saveTeamEdit = async (teamId: string, patch: { name: string; color: string }) => {
    const prev = teams;
    setTeams((list) => list.map((t) => (t.id === teamId ? { ...t, ...patch } : t)));
    try {
      const data = await post(
        { action: "update_team", teamId, name: patch.name, color: patch.color },
        { reload: false }
      );
      if (data?.team) {
        setTeams((list) =>
          list.map((t) => (t.id === teamId ? { ...t, ...normalizeTeams([data.team])[0] } : t))
        );
      }
    } catch {
      setTeams(prev);
      throw new Error("Could not update team");
    }
  };

  const setCaptain = async (teamId: string, userId: string | null) => {
    const prev = teams;
    setTeams((list) => list.map((t) => (t.id === teamId ? { ...t, captainUserId: userId } : t)));
    try {
      const data = await post(
        { action: "update_team", teamId, captainUserId: userId },
        { reload: false }
      );
      if (data?.team) {
        setTeams((list) =>
          list.map((t) => (t.id === teamId ? { ...t, ...normalizeTeams([data.team])[0] } : t))
        );
      }
    } catch {
      setTeams(prev);
    }
  };

  const reorderPlayers = async (teamId: string, orderedRsvpIds: string[]) => {
    const prev = members;
    setMembers((list) =>
      list.map((m) => {
        if (m.teamId !== teamId) return m;
        const idx = orderedRsvpIds.indexOf(m.rsvpId);
        return idx >= 0 ? { ...m, teamSortOrder: idx } : m;
      })
    );
    try {
      await post(
        { action: "reorder_members", teamId, rsvpIds: orderedRsvpIds },
        { reload: false }
      );
    } catch {
      setMembers(prev);
    }
  };

  const movePlayer = (teamId: string, rsvpId: string, dir: -1 | 1) => {
    const list = byTeam.map.get(teamId) ?? [];
    const idx = list.findIndex((m) => m.rsvpId === rsvpId);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
    const ids = list.map((m) => m.rsvpId);
    const [removed] = ids.splice(idx, 1);
    ids.splice(nextIdx, 0, removed);
    void reorderPlayers(teamId, ids);
  };

  const handlePlayerDrop = (teamId: string, targetRsvpId: string) => {
    if (!dragRsvpId || dragRsvpId === targetRsvpId) {
      setDragRsvpId(null);
      setDragOverRsvpId(null);
      return;
    }
    const list = byTeam.map.get(teamId) ?? [];
    const ids = list.map((m) => m.rsvpId);
    const from = ids.indexOf(dragRsvpId);
    const to = ids.indexOf(targetRsvpId);
    if (from < 0 || to < 0) {
      setDragRsvpId(null);
      setDragOverRsvpId(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, dragRsvpId);
    setDragRsvpId(null);
    setDragOverRsvpId(null);
    void reorderPlayers(teamId, ids);
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
          Tap a player, then tap a team to assign. Use the crown on a player to set or clear that team&apos;s
          captain (one per team). Reorder with drag or arrows.
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
                  if (ok) {
                    setLocked(!locked);
                    onEventChange({ teamsLocked: !locked });
                  }
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
                captainUserId={team.captainUserId}
                members={byTeam.map.get(team.id) ?? []}
                dropTargetId={team.id}
                selectedRsvpId={selectedRsvpId}
                dropReady={Boolean(selectedRsvpId)}
                disabled={interactionDisabled}
                canEdit={!locked && !busy}
                canReorderPlayers={!locked && !busy}
                dragOverRsvpId={dragOverRsvpId}
                onMemberClick={toggleMemberSelect}
                onDropTarget={dropOnTeam}
                canDelete={!locked && !busy}
                onDelete={() => {
                  if (confirm(`Delete ${team.name}? Players become unassigned.`)) {
                    void post({ action: "delete_team", teamId: team.id }).catch(() => undefined);
                  }
                }}
                onSaveEdit={(patch) => saveTeamEdit(team.id, patch)}
                onSetCaptain={(userId) => void setCaptain(team.id, userId)}
                onMovePlayer={(rsvpId, dir) => movePlayer(team.id, rsvpId, dir)}
                onPlayerDragStart={(rsvpId) => setDragRsvpId(rsvpId)}
                onPlayerDragOver={(rsvpId) => setDragOverRsvpId(rsvpId)}
                onPlayerDragLeave={() => setDragOverRsvpId(null)}
                onPlayerDrop={(rsvpId) => handlePlayerDrop(team.id, rsvpId)}
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
