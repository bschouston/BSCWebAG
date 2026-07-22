"use client";

import { PlayoffBracketView } from "@/components/tournament/playoff-bracket-view";
import type { PlayoffBracketStructure } from "@bsc/shared";

/** Admin preview wrapper (hover highlights). Selection is owned by the playoffs page. */
export function PlayoffBracketPreview({
  structure,
  publishedMatches,
  selectionEnabled,
  selectedMatchIds,
  onSelectedMatchIdsChange,
}: {
  structure: PlayoffBracketStructure;
  publishedMatches?: { bracketMatchId: string; courtNumber?: number | null; scheduledAt?: string | null }[];
  selectionEnabled?: boolean;
  selectedMatchIds?: string[];
  onSelectedMatchIdsChange?: (ids: string[]) => void;
}) {
  return (
    <PlayoffBracketView
      structure={structure}
      publishedMatches={publishedMatches}
      interactiveHighlights
      selectionEnabled={selectionEnabled}
      selectedMatchIds={selectedMatchIds}
      onSelectedMatchIdsChange={onSelectedMatchIdsChange}
      hint="Hover a match to highlight feeders. Check matches with both teams known, then Generate Next."
    />
  );
}
