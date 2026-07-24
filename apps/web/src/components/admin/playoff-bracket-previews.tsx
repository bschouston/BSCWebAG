"use client";

import {
  PlayoffBracketView,
  type PlayoffTrackingTeamOption,
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
  onReleaseLocks,
  busyFirestoreId,
  reseedRoundKeys,
  reseedLocked,
  onToggleReseedRound,
  teamColors,
  championTeamId,
  enableStatTrackingTeams,
  trackingTeams,
  onTrackingTeamChange,
  savingTrackingMatchId,
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
  onReleaseLocks?: (info: PublishedPlayoffMatchInfo) => void;
  busyFirestoreId?: string | null;
  reseedRoundKeys?: string[];
  reseedLocked?: boolean;
  onToggleReseedRound?: (roundKey: string, checked: boolean) => void;
  teamColors?: Record<string, string | null | undefined>;
  championTeamId?: string | null;
  enableStatTrackingTeams?: boolean;
  trackingTeams?: PlayoffTrackingTeamOption[];
  onTrackingTeamChange?: (
    info: PublishedPlayoffMatchInfo,
    trackingTeamId: string | null
  ) => void;
  savingTrackingMatchId?: string | null;
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
      showBracketCode
      managePublished
      onEditPublished={onEditPublished}
      onDeletePublished={onDeletePublished}
      onReleaseLocks={onReleaseLocks}
      busyFirestoreId={busyFirestoreId}
      reseedRoundKeys={reseedRoundKeys}
      reseedLocked={reseedLocked}
      onToggleReseedRound={onToggleReseedRound}
      teamColors={teamColors}
      championTeamId={championTeamId}
      enableStatTrackingTeams={enableStatTrackingTeams}
      trackingTeams={trackingTeams}
      onTrackingTeamChange={onTrackingTeamChange}
      savingTrackingMatchId={savingTrackingMatchId}
      hint="Hover a match to highlight feeders. When a round has both teams known, use Reseed to pair best vs worst seed. Check matches, then Generate Next (saves reseed settings). Edit upcoming published matches only. After the final is complete, Crown champion."
    />
  );
}
