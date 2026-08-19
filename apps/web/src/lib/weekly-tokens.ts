export function computeTokensFinal(opts: {
  confirmedCount: number;
  minCapacity: number;
  maxCapacity: number;
  tokensMin: number;
  tokensMax: number;
}): number {
  const minCap = Math.max(1, Math.floor(opts.minCapacity));
  const maxCap = Math.max(minCap, Math.floor(opts.maxCapacity));
  const tokensMax = Math.max(0, Math.floor(opts.tokensMax));
  const tokensMin = Math.max(0, Math.floor(opts.tokensMin));
  if (maxCap === minCap) return tokensMax;
  const n = Math.min(maxCap, Math.max(minCap, Math.floor(opts.confirmedCount)));
  const raw = tokensMax + ((tokensMin - tokensMax) * (n - minCap)) / (maxCap - minCap);
  return Math.max(0, Math.round(raw));
}

/** Normalized min/max token charges for weekly RSVP holds (see admin form labels). */
export function weeklyTokenHoldAmounts(event: {
  tokensMin?: number | null;
  tokensMax?: number | null;
  tokensRequired?: number | null;
}): { hold: number; leastCharge: number; mostCharge: number; hasRange: boolean } {
  const mostCharge = Math.max(0, Math.floor(Number(event.tokensMax ?? event.tokensRequired ?? 0)));
  const leastCharge = Math.max(
    0,
    Math.min(Math.floor(Number(event.tokensMin ?? mostCharge)), mostCharge)
  );
  return {
    hold: mostCharge,
    leastCharge,
    mostCharge,
    hasRange: leastCharge !== mostCharge,
  };
}

export function weeklyTokenMidExample(event: {
  minCapacity?: number | null;
  capacity?: number | null;
  tokensMin?: number | null;
  tokensMax?: number | null;
  tokensRequired?: number | null;
}): number {
  const minCapacity = Math.max(1, Math.floor(Number(event.minCapacity ?? 1)));
  const maxCapacity = Math.max(minCapacity, Math.floor(Number(event.capacity ?? minCapacity)));
  const { leastCharge, mostCharge } = weeklyTokenHoldAmounts(event);
  return computeTokensFinal({
    confirmedCount: Math.round((minCapacity + maxCapacity) / 2),
    minCapacity,
    maxCapacity,
    tokensMin: leastCharge,
    tokensMax: mostCharge,
  });
}
