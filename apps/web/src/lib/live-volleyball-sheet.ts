/** Default “publish to web” URL for the org volleyball tournament sheet (whole workbook). */
export const VOLLEYBALL_LIVE_SHEET_IFRAME_SRC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTimMs2jAeC7UaoiPCBqtMLHWv4cLJir2STNCDyHwv-kHwC74PVG-piwgQTC94wJC7AKl5fpmacjLMv/pubhtml?widget=true&headers=false";

/**
 * Default embed HTML seeded onto volleyball tournament docs at create/convert.
 * The public page always reads `publicIframeEmbedHtml` from the tournament — it does
 * not hardcode this URL at render time.
 */
export const VOLLEYBALL_LIVE_SHEET_IFRAME_HTML =
  `<iframe src="${VOLLEYBALL_LIVE_SHEET_IFRAME_SRC.replace(/&/g, "&amp;")}"></iframe>`;

export function isVolleyballStatTrackerId(statTrackerId: string): boolean {
  return statTrackerId.startsWith("volleyball");
}
