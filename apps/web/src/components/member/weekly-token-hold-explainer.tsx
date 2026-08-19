import { SportEvent } from "@/types";
import { weeklyTokenHoldAmounts, weeklyTokenMidExample } from "@/lib/weekly-tokens";

type Props = {
  event: Pick<
    SportEvent,
    "tokensMin" | "tokensMax" | "tokensRequired" | "minCapacity" | "capacity"
  >;
  compact?: boolean;
};

export function WeeklyTokenHoldExplainer({ event, compact = false }: Props) {
  const minPlayers = Math.max(1, Number(event.minCapacity ?? 1));
  const maxPlayers = Math.max(minPlayers, Number(event.capacity ?? minPlayers));
  const { hold, leastCharge, mostCharge, hasRange } = weeklyTokenHoldAmounts(event);
  const midExample = weeklyTokenMidExample(event);

  if (hold <= 0) {
    return (
      <p className="text-sm text-muted-foreground dark:text-white/80">
        No tokens are required for this event.
      </p>
    );
  }

  if (!hasRange) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground dark:text-white/80">
        <p>
          When you RSVP, <strong className="text-foreground dark:text-white">{hold} tokens</strong>{" "}
          are temporarily held from your wallet. That is the full cost for this event.
        </p>
        {!compact ? (
          <p>
            If you cancel before RSVP closes, the hold is returned. A valid card on file is required
            to RSVP.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm text-muted-foreground dark:text-white/80">
      <p>
        When you RSVP,{" "}
        <strong className="text-foreground dark:text-white">{hold} tokens</strong> are temporarily
        held from your wallet (the highest possible charge). They stay held until an admin finalizes
        the event after RSVP closes.
      </p>

      <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 dark:border-white/15 dark:bg-white/5">
        <p className="mb-2 font-semibold text-foreground dark:text-white">
          Final cost depends on turnout
        </p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <strong className="text-foreground dark:text-white">At least {minPlayers} players</strong>{" "}
            (minimum for the event to run): up to{" "}
            <strong className="text-foreground dark:text-white">{mostCharge} tokens</strong> each — the
            highest charge.
          </li>
          <li>
            <strong className="text-foreground dark:text-white">Full house ({maxPlayers} players)</strong>
            : as low as{" "}
            <strong className="text-foreground dark:text-white">{leastCharge} tokens</strong> each — the
            lowest charge.
          </li>
          <li>
            In between, the price scales smoothly (example around half full: about{" "}
            <strong className="text-foreground dark:text-white">{midExample} tokens</strong>).
          </li>
        </ul>
      </div>

      {!compact ? (
        <>
          <p>
            After finalization, if your final charge is less than the {hold} tokens held, the
            difference is <strong className="text-foreground dark:text-white">refunded</strong> to your
            wallet automatically.
          </p>
          <p>
            Cancel before RSVP closes to release the full hold. Waitlisted spots that never open are
            fully refunded. A valid card on file is required to RSVP.
          </p>
        </>
      ) : null}
    </div>
  );
}
