"use client";

import { PlayoffBracketView } from "@/components/tournament/playoff-bracket-view";
import type { PlayoffBracketStructure } from "@bsc/shared";

/** Admin preview wrapper (hover highlights). Selection is owned by the playoffs page. */
export function PlayoffBracketPreview({
  structure,
  publishedMatches,
  selectionEnabled,
  reseedRoundKeys,
  selectedMatchIds,
  selectedRoundKeys,
  onSelectedMatchIdsChange,
  onSelectedRoundKeysChange,
}: {
  structure: PlayoffBracketStructure;
  publishedMatches?: { bracketMatchId: string; courtNumber?: number | null; scheduledAt?: string | null }[];
  selectionEnabled?: boolean;
  /** Rounds configured for reseeding — round checkbox when populated; no per-match checkboxes. */
  reseedRoundKeys?: string[];
  selectedMatchIds?: string[];
  selectedRoundKeys?: string[];
  onSelectedMatchIdsChange?: (ids: string[]) => void;
  onSelectedRoundKeysChange?: (keys: string[]) => void;
}) {
  return (
    <PlayoffBracketView
      structure={structure}
      publishedMatches={publishedMatches}
      interactiveHighlights
      selectionEnabled={selectionEnabled}
      reseedRoundKeys={reseedRoundKeys}
      selectedMatchIds={selectedMatchIds}
      selectedRoundKeys={selectedRoundKeys}
      onSelectedMatchIdsChange={onSelectedMatchIdsChange}
      onSelectedRoundKeysChange={onSelectedRoundKeysChange}
      hint="Hover a match to highlight feeders. Check ready matches in non-reseed rounds (e.g. Play-ins), or a fully populated reseed round, then Generate Next."
    />
  );
}
