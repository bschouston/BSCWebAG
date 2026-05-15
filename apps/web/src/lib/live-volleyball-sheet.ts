/** Published “web” embed URL for the org volleyball tournament sheet (standings / live updates). */
export const VOLLEYBALL_LIVE_SHEET_IFRAME_SRC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTimMs2jAeC7UaoiPCBqtMLHWv4cLJir2STNCDyHwv-kHwC74PVG-piwgQTC94wJC7AKl5fpmacjLMv/pubhtml?gid=0&single=true&widget=true&headers=false";

/** Stored on tournament docs — matches Google’s “publish to web” iframe snippet (`&amp;` in attributes). */
export const VOLLEYBALL_LIVE_SHEET_IFRAME_HTML =
  `<iframe src="https://docs.google.com/spreadsheets/d/e/2PACX-1vTimMs2jAeC7UaoiPCBqtMLHWv4cLJir2STNCDyHwv-kHwC74PVG-piwgQTC94wJC7AKl5fpmacjLMv/pubhtml?gid=0&amp;single=true&amp;widget=true&amp;headers=false"></iframe>`;

export function isVolleyballStatTrackerId(statTrackerId: string): boolean {
  return statTrackerId.startsWith("volleyball");
}
