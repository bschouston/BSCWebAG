"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConfirmTypeDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  consequences: string[];
  /** Extra warning shown when deleting completed / recorded matches. */
  destructiveHint?: string | null;
  /** Word the admin must type (case-insensitive). Default: delete */
  confirmWord?: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  confirming?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmTypeDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  destructiveHint,
  confirmWord = "delete",
  confirmLabel = "Delete permanently",
  confirmingLabel,
  confirming = false,
  onConfirm,
}: ConfirmTypeDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const expected = confirmWord.trim().toLowerCase();

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const canConfirm = typed.trim().toLowerCase() === expected && !confirming;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={!confirming}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {destructiveHint ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            {destructiveHint}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="confirm-type-word">
            Type <span className="font-mono font-semibold">{expected}</span> to confirm
          </Label>
          <Input
            id="confirm-type-word"
            autoComplete="off"
            value={typed}
            disabled={confirming}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={expected}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={confirming}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
          >
            {confirming ? confirmingLabel ?? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function matchDeleteConsequences(): string[] {
  return [
    "The match document will be removed",
    "All recorded plays for this match will be deleted",
    "Any tracker locks for this match will be removed",
    "Tracker activity logs for this match will be deleted",
    "Player and team stats will be rebuilt without this match",
  ];
}

export function matchResetConsequences(): string[] {
  return [
    "The match stays on the schedule (teams, court, and time kept)",
    "All recorded plays for this match will be deleted",
    "Any tracker locks for this match will be removed",
    "Tracker activity logs for this match will be deleted",
    "Scores and status reset to a pristine UPCOMING match",
    "Player and team stats / standings will be rebuilt without this match's results",
  ];
}

export function matchResetAllConsequences(): string[] {
  return [
    "Every completed round-robin match will be wiped and returned to UPCOMING",
    "Playoff matches are not affected",
    "Matches with active tracker locks will be skipped",
    "Plays, locks, and tracker activity for reset matches will be deleted",
    "Player and team stats / standings will be rebuilt once at the end",
  ];
}

export function matchDeleteAllConsequences(): string[] {
  return [
    "Every pool / round-robin match will be permanently removed from the schedule",
    "Playoff matches are not affected — delete playoffs first if a bracket is saved or published",
    "All recorded plays for those matches will be deleted",
    "Any tracker locks for those matches will be removed",
    "Tracker activity logs for those matches will be deleted",
    "Player and team stats / standings will be rebuilt once at the end",
    "Nothing is deleted if any match is in progress or still has an active tracker lock",
  ];
}

export function playoffsClearConsequences(): string[] {
  return [
    "The saved playoff bracket will be removed",
    "All published playoff schedule matches will be deleted",
    "Plays, locks, and tracker activity for those matches will be deleted",
    "Player and team stats will be rebuilt without those matches",
    "Reseed settings will reset to off (default)",
  ];
}
