"use client";

import {
  PlayoffBracketView,
  type PublishedPlayoffMatchInfo,
} from "@/components/tournament/playoff-bracket-view";
import type { PlayoffBracketStructure } from "@bsc/shared";

/** Admin preview wrapper (hover highlights). Selection/edit/delete owned by the playoffs page. */
export function PlayoffBracketPreview({
  structure,
  publishedMatches,
  selectionEnabled,
  selectedMatchIds,
  onSelectedMatchIdsChange,
  onEditPublished,
  onDeletePublished,
  busyFirestoreId,
}: {
  structure: PlayoffBracketStructure;
  publishedMatches?: PublishedPlayoffMatchInfo[];
  selectionEnabled?: boolean;
  selectedMatchIds?: string[];
  onSelectedMatchIdsChange?: (ids: string[]) => void;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
}) {
  return (
    <PlayoffBracketView
      structure={structure}
      publishedMatches={publishedMatches}
      interactiveHighlights
      selectionEnabled={selectionEnabled}
      selectedMatchIds={selectedMatchIds}
      onSelectedMatchIdsChange={onSelectedMatchIdsChange}
      showMatchId
      managePublished
      onEditPublished={onEditPublished}
      onDeletePublished={onDeletePublished}
      busyFirestoreId={busyFirestoreId}
      hint="Hover a match to highlight feeders. Check matches with both teams known, then Generate Next. Edit court/time on published matches while they are still upcoming."
    />
  );
}
