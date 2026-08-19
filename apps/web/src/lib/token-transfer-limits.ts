/** Transfer limits (whole tokens). Shared by API and wallet UI. */
export const TRANSFER_MIN = 1;
export const TRANSFER_MAX = 50;
export const TRANSFER_DAILY_MAX = 500;

export function maxSendableTokens(opts: {
  balance: number;
  tokensTransferredToday: number;
}): number {
  const remainingDaily = Math.max(0, TRANSFER_DAILY_MAX - Math.max(0, opts.tokensTransferredToday));
  return Math.max(
    0,
    Math.min(TRANSFER_MAX, Math.floor(Math.max(0, opts.balance)), remainingDaily)
  );
}
