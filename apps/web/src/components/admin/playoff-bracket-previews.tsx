"use client";

import {
  PlayoffBracketView,
  type PublishedPlayoffMatchInfo,
} from "@/components/tournament/playoff-bracket-view";
import type { PlayoffBracketStructure } from "@bsc/shared";

/** Admin preview wrapper (hover highlights). Selection/edit/delete owned by the playoffs page. */
export function PlayoffBracketPreview({
  structure,
  feederStructure,
  publishedMatches,
  selectionEnabled,
  selectedMatchIds,
  onSelectedMatchIdsChange,
  onEditPublished,
  onDeletePublished,
  busyFirestoreId,
  reseedRoundKeys,
  reseedLocked,
  onToggleReseedRound,
}: {
  structure: PlayoffBracketStructure;
  /** Template structure for winner/loser destination labels. */
  feederStructure?: PlayoffBracketStructure;
  publishedMatches?: PublishedPlayoffMatchInfo[];
  selectionEnabled?: boolean;
  selectedMatchIds?: string[];
  onSelectedMatchIdsChange?: (ids: string[]) => void;
  onEditPublished?: (info: PublishedPlayoffMatchInfo) => void;
  onDeletePublished?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  reseedRoundKeys?: string[];
  reseedLocked?: boolean;
  onToggleReseedRound?: (roundKey: string, checked: boolean) => void;
}) {
  return (
    <PlayoffBracketView
      structure={structure}
      feederStructure={feederStructure}
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
      reseedRoundKeys={reseedRoundKeys}
      reseedLocked={reseedLocked}
      onToggleReseedRound={onToggleReseedRound}
      hint="Hover a match to highlight feeders. When a round has both teams known, use Reseed to pair best vs worst seed. Check matches, then Generate Next (saves reseed settings). Edit upcoming published matches only."
    />
  );
}
