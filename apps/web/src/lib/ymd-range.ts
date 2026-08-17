import { chicagoWallToUtc } from "@/lib/chicago-time";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseYmdParam(value: string | null): string | null {
    if (!value || !YMD.test(value)) return null;
    return value;
}

/** Inclusive Chicago calendar-day bounds for `from`/`to` YYYY-MM-DD query params. */
export function chicagoDayBounds(
    from: string | null,
    to: string | null
): { start: Date | null; end: Date | null } {
    let startYmd = from;
    let endYmd = to;
    if (startYmd && endYmd && startYmd > endYmd) {
        [startYmd, endYmd] = [endYmd, startYmd];
    }
    return {
        start: startYmd ? chicagoWallToUtc(`${startYmd}T00:00:00`) : null,
        end: endYmd ? chicagoWallToUtc(`${endYmd}T23:59:59`) : null,
    };
}
