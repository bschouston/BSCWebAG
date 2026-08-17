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
