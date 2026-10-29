"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TrackerOption = { id: string; name: string; sport: string; version?: string };
type FormField = { id: string; label: string; enabled?: boolean };

type ConvertTournamentDialogProps = {
  event: { id: string; title: string; registrationFormId?: string | null } | null;
  open: boolean;
  converting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConvert: (body: {
    eventId: string;
    statTrackerId: string;
    playerProfile: {
      nameFieldIds: string[];
      portraitFieldId: string | null;
      fields: { id: string; visibility: "public" | "private" }[];
    };
  }) => Promise<void>;
  authToken: () => Promise<string | undefined>;
};

export function ConvertTournamentDialog({
  event,
  open,
  converting,
  error,
  onOpenChange,
  onConvert,
  authToken,
}: ConvertTournamentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<TrackerOption[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [statTrackerId, setStatTrackerId] = useState("");
  const [nameFieldIds, setNameFieldIds] = useState<string[]>([]);
  const [nameToAdd, setNameToAdd] = useState("");
  const [portraitFieldId, setPortraitFieldId] = useState("");
  const [visibility, setVisibility] = useState<Record<string, "" | "public" | "private">>({});

  useEffect(() => {
    if (!open || !event) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setStatTrackerId("");
    setNameFieldIds([]);
    setNameToAdd("");
    setPortraitFieldId("");
    setVisibility({});
    setFields([]);
    setTrackers([]);

    void (async () => {
      try {
        const token = await authToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const formId = event.registrationFormId?.trim() ?? "";
        const [trackerRes, formRes] = await Promise.all([
          fetch("/api/sport-trackers", { headers }),
          formId ? fetch(`/api/admin/registration-forms/${formId}`, { headers }) : Promise.resolve(null),
        ]);
        const trackerData = await trackerRes.json().catch(() => ({}));
        if (!trackerRes.ok) throw new Error(trackerData?.error ?? "Failed to load trackers");
        let nextFields: FormField[] = [];
        if (!formId) {
          throw new Error("Attach a registration form to this event before converting.");
        }
        if (!formRes) throw new Error("Attach a registration form to this event before converting.");
        const formData = await formRes.json().catch(() => ({}));
        if (!formRes.ok) throw new Error(formData?.error ?? "Failed to load the registration form");
        const rawFields = (formData.form?.fields ?? []) as FormField[];
        nextFields = rawFields
          .filter((field) => field.enabled !== false && field.id)
          .map((field) => ({
            id: field.id,
            label: field.label?.trim() || field.id,
          }));
        if (cancelled) return;
        setTrackers((trackerData.trackers ?? []) as TrackerOption[]);
        setFields(nextFields);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load convert options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, event, authToken]);

  const fieldLabel = (id: string) => fields.find((field) => field.id === id)?.label ?? id;
  const remainingForName = fields.filter((field) => !nameFieldIds.includes(field.id));
  const profileFields = fields.filter((field) => !nameFieldIds.includes(field.id) && field.id !== portraitFieldId);
  const copiedIds = Object.entries(visibility)
    .filter(([id, value]) => profileFields.some((field) => field.id === id) && (value === "public" || value === "private" || value === ""))
    .map(([id]) => id);
  const ready =
    !!statTrackerId &&
    nameFieldIds.length > 0 &&
    copiedIds.every((id) => visibility[id] === "public" || visibility[id] === "private");

  const trackerEmpty = !loading && trackers.length === 0;

  const summary = useMemo(() => nameFieldIds.map(fieldLabel).join(", "), [nameFieldIds, fields]);

  const toggleField = (id: string, checked: boolean) => {
    setVisibility((prev) => {
      const next = { ...prev };
      if (checked) next[id] = "";
      else delete next[id];
      return next;
    });
  };

  const submit = async () => {
    if (!event || !ready) return;
    await onConvert({
      eventId: event.id,
      statTrackerId,
      playerProfile: {
        nameFieldIds,
        portraitFieldId: portraitFieldId || null,
        fields: copiedIds
          .filter((id) => visibility[id] === "public" || visibility[id] === "private")
          .map((id) => ({ id, visibility: visibility[id] as "public" | "private" })),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto text-foreground">
        <DialogHeader>
          <DialogTitle>Convert to tournament</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {event?.title ?? "Featured event"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading trackers and form fields…</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-foreground">Stat tracker</Label>
              {trackerEmpty ? (
                <p className="text-sm text-foreground">
                  No trackers registered yet. Create one in the tracker app under All trackers.
                </p>
              ) : (
                <Select value={statTrackerId || undefined} onValueChange={setStatTrackerId}>
                  <SelectTrigger className="text-foreground">
                    <SelectValue placeholder="Select a tracker" />
                  </SelectTrigger>
                  <SelectContent>
                    {trackers.map((tracker) => (
                      <SelectItem key={tracker.id} value={tracker.id}>
                        {tracker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Player name</Label>
              <p className="text-sm text-muted-foreground">
                Choose one or more form fields, in order. Their answers are joined into the roster name.
                {summary ? ` Current order: ${summary}.` : ""}
              </p>
              {nameFieldIds.length > 0 && (
                <ol className="space-y-1">
                  {nameFieldIds.map((id, index) => (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                      <span className="text-sm text-foreground">
                        {index + 1}. {fieldLabel(id)}
                      </span>
                      <span className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() =>
                            setNameFieldIds((ids) => {
                              const next = [...ids];
                              const [item] = next.splice(index, 1);
                              next.splice(index - 1, 0, item);
                              return next;
                            })
                          }
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === nameFieldIds.length - 1}
                          onClick={() =>
                            setNameFieldIds((ids) => {
                              const next = [...ids];
                              const [item] = next.splice(index, 1);
                              next.splice(index + 1, 0, item);
                              return next;
                            })
                          }
                        >
                          Down
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setNameFieldIds((ids) => ids.filter((fieldId) => fieldId !== id))}
                        >
                          Remove
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {remainingForName.length > 0 && (
                <div className="flex gap-2">
                  <Select value={nameToAdd || undefined} onValueChange={setNameToAdd}>
                    <SelectTrigger className="text-foreground">
                      <SelectValue placeholder="Add a name field" />
                    </SelectTrigger>
                    <SelectContent>
                      {remainingForName.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!nameToAdd}
                    onClick={() => {
                      if (!nameToAdd) return;
                      setNameFieldIds((ids) => [...ids, nameToAdd]);
                      setPortraitFieldId((current) => (current === nameToAdd ? "" : current));
                      setVisibility((prev) => {
                        const next = { ...prev };
                        delete next[nameToAdd];
                        return next;
                      });
                      setNameToAdd("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground">Portrait</Label>
              <p className="text-sm text-muted-foreground">Optional. Leave this unset if the player has no portrait.</p>
              <Select
                value={portraitFieldId || "__none__"}
                onValueChange={(value) => {
                  const next = value === "__none__" ? "" : value;
                  setPortraitFieldId(next);
                  if (next) {
                    setVisibility((prev) => {
                      const copy = { ...prev };
                      delete copy[next];
                      return copy;
                    });
                  }
                }}
              >
                <SelectTrigger className="text-foreground">
                  <SelectValue placeholder="No portrait" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No portrait</SelectItem>
                  {fields
                    .filter((field) => !nameFieldIds.includes(field.id))
                    .map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Other fields</Label>
              <p className="text-sm text-muted-foreground">
                Check a field to copy it onto the player, then mark it public or private. Nothing is selected for you.
              </p>
              {profileFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other fields on this form.</p>
              ) : (
                <ul className="space-y-2">
                  {profileFields.map((field) => {
                    const checked = field.id in visibility;
                    return (
                      <li key={field.id} className="rounded-md border px-3 py-2 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleField(field.id, value === true)}
                          />
                          {field.label}
                        </label>
                        {checked && (
                          <Select
                            value={visibility[field.id] || undefined}
                            onValueChange={(value: "public" | "private") =>
                              setVisibility((prev) => ({ ...prev, [field.id]: value }))
                            }
                          >
                            <SelectTrigger className="text-foreground">
                              <SelectValue placeholder="Public or private" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">Public</SelectItem>
                              <SelectItem value="private">Private</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!ready || converting || loading || !!loadError}>
            {converting ? "Converting…" : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
